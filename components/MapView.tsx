'use client'

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import { AnimatePresence, motion } from 'framer-motion'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '@/lib/supabase'
import { TOKENS } from '@/lib/tokens'
import { getCentroid } from '@/lib/fsaCentroids'
import { getAreaLabel } from '@/lib/fsaData'
import { useReducedMotion } from '@/lib/motionSafety'
import { safeGetItem } from '@/lib/storage'
import { playChime } from '@/lib/sounds'
import type { FilterState, NeighbourhoodStats } from '@/lib/types'
import type { Submission, MapViewHandle, UserProfile } from '@/lib/types'
import { fetchNeighbourhood } from '@/lib/fetchNeighbourhood'
import NeighbourhoodPanel from '@/components/NeighbourhoodPanel'
import { matchCohort } from '@/lib/cohortMatch'
import type { CohortResult } from '@/lib/cohortMatch'
import styles from '@/styles/MarkerTooltip.module.css'

// ─── Leaflet default-icon fix ─────────────────────────────────────────────────
import _iconUrl       from 'leaflet/dist/images/marker-icon.png'
import _iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import _shadowUrl     from 'leaflet/dist/images/marker-shadow.png'

function assetSrc(mod: unknown): string {
  if (typeof mod === 'string') return mod
  const m = mod as { src?: string; default?: string }
  return m.src ?? m.default ?? ''
}

delete (L.Icon.Default.prototype as { _getIconUrl?: () => void })._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl:       assetSrc(_iconUrl),
  iconRetinaUrl: assetSrc(_iconRetinaUrl),
  shadowUrl:     assetSrc(_shadowUrl),
})

// ─── Marker icon factory ──────────────────────────────────────────────────────
// UNCHANGED — do not modify anything in this section

function sealColor(sentiment: number | null): string {
  if (sentiment == null) return TOKENS.colors.cau400
  if (sentiment <= 2) return TOKENS.colors.pos400
  if (sentiment === 3) return TOKENS.colors.cau400
  return TOKENS.colors.neg400
}

function markerScale(pct: number | null): number {
  // Decreases (negative pct) have the same magnitude as equivalent increases.
  // Math.abs() so −12% and +12% render at the same envelope size.
  // Null (dollar-mode) defaults to 25 → mid-size envelope.
  const absPct  = Math.abs(pct ?? 25)
  const clamped = Math.min(50, Math.max(0, absPct))
  return 0.6 + (clamped / 50) * 0.8
}

function buildIcon(fill: string, seal: string, scale: number, duration = 0, delay = 0, ariaLabel?: string): L.DivIcon {
  const W = 40, H = 28
  const bobStyle = duration > 0
    ? `animation:envelopeBob ${duration}ms ease-in-out infinite;animation-delay:${delay}ms;`
    : ''
  // Outer wrapper carries role+aria so the SVG stays decorative (WCAG 1.1.1)
  const outerAria = ariaLabel
    ? `role="button" tabindex="0" aria-label="${ariaLabel}"`
    : `aria-hidden="true"`
  const trackColor = TOKENS.colors.n200 // #D4D3CE — envelope border / track
  const paperColor = TOKENS.colors.n150 // #E2E1DD — envelope flap fill
  const html =
    `<div class="env-hover-wrap" ${outerAria} style="display:inline-block;transform-origin:bottom center;cursor:pointer">` +
    `<div style="width:${W}px;height:${H}px;transform:scale(${scale.toFixed(3)});transform-origin:bottom center;overflow:visible">` +
    `<div class="envelope-marker" style="will-change:transform;${bobStyle}">` +
    `<svg width="${W}" height="${H}" viewBox="0 0 40 28" fill="none" aria-hidden="true" style="display:block;overflow:visible">` +
    `<rect x="0.5" y="0.5" width="39" height="27" rx="2.5" fill="${fill}" stroke="${trackColor}" stroke-width="0.8"/>` +
    `<polygon points="0,0 40,0 20,15" fill="${paperColor}" opacity="0.8"/>` +
    `<circle cx="20" cy="6.5" r="4" fill="${seal}"/>` +
    `</svg></div></div></div>`
  return L.divIcon({ html, className: '', iconSize: [W * scale, H * scale], iconAnchor: [(W * scale) / 2, H * scale] })
}

function markerAriaLabel(s: Submission): string {
  const type = s.insurance_type === 'home' ? 'home' : 'auto'
  const mood = s.sentiment == null || s.sentiment === 3
    ? 'neutral'
    : s.sentiment <= 2 ? 'positive' : 'negative'
  const pct = s.rate_change_pct != null
    ? ` · ${s.rate_change_pct >= 0 ? '+' : '−'}${Math.abs(Math.round(s.rate_change_pct))}%`
    : ''
  return `${mood.charAt(0).toUpperCase() + mood.slice(1)} ${type} renewal${pct}`
}

function makeIcon(s: Submission, duration: number, delay: number): L.DivIcon {
  return buildIcon(TOKENS.colors.paperBody, sealColor(s.sentiment), markerScale(s.rate_change_pct), duration, delay, markerAriaLabel(s))
}

const SKELETON_ICON = buildIcon('#EEEDEA', '#D4D3CE', 1.0) // aria-hidden — no semantic content

// ─── Skeleton coordinates ─────────────────────────────────────────────────────
const SKELETON_COORDS: Array<[number, number]> = [
  [43.651, -79.383], [43.660, -79.395], [43.642, -79.371], [43.670, -79.410],
  [43.633, -79.420], [43.680, -79.355], [43.645, -79.440], [43.655, -79.365],
]

// ─── Filter matching ──────────────────────────────────────────────────────────
// UNCHANGED

function getMarkerMatchState(s: Submission, f: FilterState): boolean {
  if (f.insuranceType !== null && f.insuranceType !== s.insurance_type) return false
  if (f.provider !== null && f.provider !== (s.provider ?? '')) return false
  // Dollar-mode submissions (null pct) always pass the rate range filter
  if (s.rate_change_pct !== null) {
    const pct = s.rate_change_pct
    if (pct < f.rMin || pct > f.rMax) return false
  }
  return true
}

// ─── Map setup ────────────────────────────────────────────────────────────────
// UNCHANGED

function MapSetup({
  onExternalReady,
  onLocalMap,
  onDismiss,
}: {
  onExternalReady?: (m: L.Map) => void
  onLocalMap:       (m: L.Map) => void
  onDismiss:        () => void
}) {
  const map      = useMap()
  const extRef   = useRef(onExternalReady)
  const localRef = useRef(onLocalMap)
  const dimRef   = useRef(onDismiss)

  useEffect(() => {
    extRef.current?.(map)
    localRef.current(map)
    const dismiss = () => dimRef.current()
    map.on('click',     dismiss)
    map.on('movestart', dismiss)
    map.on('zoomstart', dismiss)
    return () => {
      map.off('click',     dismiss)
      map.off('movestart', dismiss)
      map.off('zoomstart', dismiss)
    }
  }, [map])

  return null
}

// ─── Tooltip helpers ──────────────────────────────────────────────────────────

function rateColor(sentiment: number | null): string {
  if (sentiment == null) return 'var(--cau-500)'
  if (sentiment <= 2) return TOKENS.colors.pos500
  if (sentiment === 3) return 'var(--cau-500)'
  /* cau-500 (#AD7710): 3.80:1 on white.
     Passes WCAG 1.4.11 at ≥14px bold (large text threshold: 3:1 min).
     Applied at fontSize:15 fontWeight:700 in MapView — qualifies as large text.
     DO NOT reuse at smaller sizes or lighter weights — would fail AA. ✓ */
  return TOKENS.colors.neg500
}

// Sentiment face — exact filled-circle style from the submission form.
// Panel uses size=32; preview uses size=20 (same SVG scaled down).
function SentimentFace({ sentiment, size }: { sentiment: number | null; size: number }) {
  if (sentiment === 1) return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r="15" fill={TOKENS.colors.pos400}/>
      <circle cx="12" cy="14" r="2" fill="white"/>
      <circle cx="22" cy="14" r="2" fill="white"/>
      <path d="M10 21Q17 27 24 21" stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
    </svg>
  )
  if (sentiment === 2) return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r="15" fill={TOKENS.colors.pos200}/>
      <circle cx="12" cy="14" r="2" fill={TOKENS.colors.pos600}/>
      <circle cx="22" cy="14" r="2" fill={TOKENS.colors.pos600}/>
      <path d="M12 21Q17 24.5 22 21" stroke={TOKENS.colors.pos600} strokeWidth="2.2" strokeLinecap="round" fill="none"/>
    </svg>
  )
  if (sentiment === 3) return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r="15" fill={TOKENS.colors.cau400}/>
      <circle cx="12" cy="14" r="2" fill="white"/>
      <circle cx="22" cy="14" r="2" fill="white"/>
      <path d="M12 22L22 22" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  )
  if (sentiment === 4) return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r="15" fill="var(--neg-200)"/>
      <circle cx="12" cy="14" r="2" fill="white"/>
      <circle cx="22" cy="14" r="2" fill="white"/>
      <path d="M12 24Q17 20 22 24" stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
    </svg>
  )
  // sentiment 5
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r="15" fill={TOKENS.colors.neg400}/>
      <circle cx="12" cy="13" r="2" fill="white"/>
      <circle cx="22" cy="13" r="2" fill="white"/>
      <path d="M10 24Q17 19 24 24" stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
    </svg>
  )
}


function pctString(pct: number | null): string {
  if (pct == null) return '–'
  return pct >= 0 ? `+${pct}%` : `${pct}%`
}

// ─── Tooltip state ────────────────────────────────────────────────────────────

type TooltipMode = 'preview' | 'locked'

interface ActiveTooltip {
  sub:  Submission
  x:    number
  y:    number
  mode: TooltipMode
}

// ─── HoverPreview — Mode 1 (desktop only, auto-dismisses) ────────────────────

interface HoverPreviewProps {
  sub:            Submission
  x:              number
  y:              number
  isFirst:        boolean
  prefersReduced: boolean
  onMouseEnter:   () => void
  onMouseLeave:   () => void
  onFirstShown:   () => void
  onNavigate:     () => void
}

function HoverPreview({
  sub, x, y, isFirst, prefersReduced, onMouseEnter, onMouseLeave, onFirstShown, onNavigate,
}: HoverPreviewProps) {
  const label  = getAreaLabel(sub.fsa)
  const pct    = pctString(sub.rate_change_pct)

  return (
    <motion.div
      className={styles.preview}
      aria-hidden="true"
      style={{
        position:        'fixed',
        left:            x,
        top:             y - 8,
        transform:       'translateX(-50%) translateY(-100%)',
        transformOrigin: 'bottom center', // Rule 5 — grows up from marker
        zIndex:          300, // z-tooltip
      }}
      // Rule 2: starts at scale(0.97) not 0; Rule 4: ease-out; Rule 6: 180ms
      initial={isFirst && !prefersReduced
        ? { opacity: 0, scale: 0.97, y: 4 }
        : { opacity: 0 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0,
              transition: { duration: prefersReduced ? 0.15 : 0.12,
                            ease: [0.4, 0, 1, 1] as [number,number,number,number] } }}
      // Rule 3: subsequent (isFirst=false) appear instantly (duration:0)
      transition={isFirst && !prefersReduced
        ? { duration: 0.18, ease: [0.16, 1, 0.3, 1] as [number,number,number,number] }
        : { duration: 0 }}
      onAnimationComplete={() => { if (isFirst) onFirstShown() }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Main content row */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <SentimentFace sentiment={sub.sentiment} size={20} />
        <span style={{
          fontVariationSettings: "'opsz' 32",
          fontSize:              15,
          fontWeight:            700,
          letterSpacing:         '-0.02em',
          fontVariantNumeric:    'tabular-nums',
          marginLeft:            6,
          color:                 rateColor(sub.sentiment),
        }}>
          {pct}
        </span>
        <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--n-400)', marginLeft: 8 }}>
          {label}
        </span>
      </div>
      {/* "View details" row — replaces "click for details" */}
      <div className={styles.viewDetails}>
        View details
        <svg
          width="10" height="10"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M2 5h6M5.5 2.5L8 5l-2.5 2.5"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {/* 12px invisible bridge — prevents dismiss flicker when cursor crosses gap */}
      <div
        className={styles.bridge}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />
    </motion.div>
  )
}

// ─── MapMarker ────────────────────────────────────────────────────────────────

// ─── MapMarker ────────────────────────────────────────────────────────────────

interface MapMarkerProps {
  s:              Submission
  icon:           L.DivIcon
  pos:            [number, number]
  isMatch:        boolean
  staggerDelay:   number
  mapRef:         React.MutableRefObject<L.Map | null>
  onMarkerEnter:  (sub: Submission, x: number, y: number) => void
  onMarkerLeave:  () => void
  onMarkerClick:  (sub: Submission, x: number, y: number) => void
}

function MapMarker({
  s, icon, pos, isMatch, staggerDelay, mapRef,
  onMarkerEnter, onMarkerLeave, onMarkerClick,
}: MapMarkerProps) {
  const markerRef    = useRef<L.Marker>(null)
  const prevMatchRef = useRef<boolean | null>(null)

  useEffect(() => {
    const el   = markerRef.current?.getElement()
    const wrap = el?.querySelector<HTMLElement>('.env-hover-wrap')
    if (!el || !wrap) return

    const wasMatch = prevMatchRef.current
    prevMatchRef.current = isMatch

    wrap.style.transitionDelay = `${staggerDelay}ms`

    if (isMatch) {
      el.style.pointerEvents = ''
      wrap.classList.remove('marker-dim')
      wrap.classList.add('marker-match')
      if (wasMatch === false) {
        wrap.classList.remove('marker-pulse')
        void wrap.offsetWidth
        wrap.classList.add('marker-pulse')
        const t = setTimeout(() => wrap.classList.remove('marker-pulse'), 350)
        return () => clearTimeout(t)
      }
    } else {
      el.style.pointerEvents = 'none'
      wrap.classList.remove('marker-match', 'marker-pulse')
      wrap.classList.add('marker-dim')
    }
  }, [isMatch, staggerDelay])

  const getScreenCoords = () => {
    const map = mapRef.current
    if (!map) return null
    const pt   = map.latLngToContainerPoint(pos)
    const rect = map.getContainer().getBoundingClientRect()
    return { x: rect.left + pt.x, y: rect.top + pt.y }
  }

  // Keyboard navigation: Enter/Space on a focused envelope navigates to detail
  useEffect(() => {
    const el   = markerRef.current?.getElement()
    const wrap = el?.querySelector<HTMLElement>('.env-hover-wrap')
    if (!el || !wrap) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      const coords = getScreenCoords()
      if (coords) onMarkerClick(s, coords.x, coords.y)
    }
    wrap.addEventListener('keydown', handleKeyDown)
    return () => wrap.removeEventListener('keydown', handleKeyDown)
  // getScreenCoords is a stable closure over pos/mapRef — safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, onMarkerClick])

  return (
    <Marker
      ref={markerRef as React.Ref<L.Marker>}
      position={pos}
      icon={icon}
      eventHandlers={{
        mouseover: () => {
          const coords = getScreenCoords()
          if (coords) onMarkerEnter(s, coords.x, coords.y)
        },
        mouseout: onMarkerLeave,
        click: () => {
          const coords = getScreenCoords()
          if (coords) onMarkerClick(s, coords.x, coords.y)
        },
      }}
    />
  )
}

// ─── MapViewProps ─────────────────────────────────────────────────────────────

interface MapViewProps {
  filters:              FilterState
  onReady?:             (handle: MapViewHandle) => void
  onLeafletReady?:      (map: L.Map) => void
  likeMeMode?:          boolean
  userProfile?:         UserProfile | null
  onCohortResult?:      (result: CohortResult | null) => void
  onCtaClick?:          (fsa?: string) => void
  onMatchCountChange?:  (n: number) => void
}

// ─── MapView ──────────────────────────────────────────────────────────────────

export default function MapView({
  filters, onReady, onLeafletReady,
  likeMeMode = false, userProfile = null,
  onCohortResult, onCtaClick, onMatchCountChange,
}: MapViewProps) {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [isLoading,   setIsLoading]   = useState(true)
  const [viewerFsa,   setViewerFsa]   = useState<string | null>(null)
  const [isMobile,    setIsMobile]    = useState(false)

  // Desktop breakpoint for side-panel layout — starts false (SSR-safe, no hydration mismatch)
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    setIsDesktop(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // NeighbourhoodPanel state
  const [panelFsa,     setPanelFsa]     = useState<string | null>(null)
  const [panelStats,   setPanelStats]   = useState<NeighbourhoodStats | null>(null)
  const [panelLoading, setPanelLoading] = useState(false)
  const fetchIdRef = useRef(0)

  // Single state drives all tooltip rendering
  const [activeTooltip, setActiveTooltip] = useState<ActiveTooltip | null>(null)
  const tooltipRef = useRef<ActiveTooltip | null>(null)
  tooltipRef.current = activeTooltip

  const localMapRef      = useRef<L.Map | null>(null)
  const hideTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipEverShown = useRef(false)
  const isInitialLoad    = useRef(true)

  const { prefersReduced } = useReducedMotion()
  const prefersReducedRef  = useRef(prefersReduced)
  prefersReducedRef.current = prefersReduced

  // Treat every preview as "subsequent" when reduced motion is on
  useEffect(() => {
    if (prefersReduced) tooltipEverShown.current = true
  }, [prefersReduced])

  // Mobile breakpoint detection
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 680px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Read viewer FSA from localStorage (client-side only)
  useEffect(() => {
    setViewerFsa(safeGetItem('ratemap_last_fsa'))
  }, [])

  const markerCache = useRef<Map<string, L.DivIcon>>(new Map())
  function getCachedIcon(s: Submission): L.DivIcon {
    let icon = markerCache.current.get(s.id)
    if (!icon) {
      const duration = Math.round(3000 + Math.random() * 2000)
      const delay    = Math.round(Math.random() * 2500)
      icon = makeIcon(s, duration, delay)
      markerCache.current.set(s.id, icon)
    }
    return icon
  }

  const dismissAll = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    setActiveTooltip(null)
  }, [])

  const cancelHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const startHideTimer = useCallback(() => {
    // 200ms grace period — cursor can travel from envelope to tooltip without dismissal
    hideTimerRef.current = setTimeout(() => setActiveTooltip(null), 200)
  }, [])

  const closePanel = useCallback(() => {
    setPanelFsa(null)
    setPanelStats(null)
  }, [])

  const handleEnvelopeClick = useCallback(async (fsa: string) => {
    if (panelFsa === fsa) {
      setPanelFsa(null)
      setPanelStats(null)
      return
    }
    const fetchId = ++fetchIdRef.current
    setPanelFsa(fsa)
    setPanelStats(null)
    setPanelLoading(true)
    const stats = await fetchNeighbourhood(fsa)
    if (fetchId !== fetchIdRef.current) return // stale — another FSA was clicked
    setPanelStats(stats)
    setPanelLoading(false)
  }, [panelFsa])

  // Mouse enters a marker
  const onMarkerEnter = useCallback((sub: Submission, x: number, y: number) => {
    cancelHideTimer()
    const current = tooltipRef.current
    if (current?.mode === 'locked') {
      // While locked: update content with blur crossfade, keep locked
      setActiveTooltip({ sub, x, y, mode: 'locked' })
    } else {
      // Show hover preview
      setActiveTooltip({ sub, x, y, mode: 'preview' })
    }
  }, [cancelHideTimer])

  // Mouse leaves a marker
  const onMarkerLeave = useCallback(() => {
    if (tooltipRef.current?.mode === 'locked') return // locked panel ignores mouse-leave
    startHideTimer()
  }, [startHideTimer])

  // Click / tap on a marker — opens neighbourhood panel for that FSA
  const onMarkerClick = useCallback((sub: Submission, _x: number, _y: number) => {
    cancelHideTimer()
    setActiveTooltip(null) // dismiss hover preview
    handleEnvelopeClick(sub.fsa)
  }, [cancelHideTimer, handleEnvelopeClick])

  const prependSubmission = useCallback((sub: Submission) => {
    if (!isInitialLoad.current && !prefersReducedRef.current) playChime()
    setSubmissions(prev =>
      prev.some(s => s.id === sub.id) ? prev : [sub, ...prev],
    )
  }, [])

  const flyToFsa = useCallback((fsa: string) => {
    const centroid = getCentroid(fsa)
    if (!centroid || !localMapRef.current) return
    localMapRef.current.flyTo(centroid, 14, { duration: 1.2, easeLinearity: 0.1 })
  }, [])

  useEffect(() => {
    onReady?.({ prependSubmission, flyToFsa })
  }, [onReady, prependSubmission, flyToFsa])

  // When the panel opens on desktop, pan the map left so the selected envelope
  // stays visible in the area beside the panel rather than hidden underneath.
  // Pan offset = half the panel width (200px) so the centroid lands in the
  // visible portion of the map. Skipped on mobile — bottom drawer doesn't occlude.
  useEffect(() => {
    if (!panelFsa || !localMapRef.current || !isDesktop) return
    const centroid = getCentroid(panelFsa)
    if (!centroid) return
    const PANEL_WIDTH = 400
    const timer = setTimeout(() => {
      const map = localMapRef.current!
      const containerPt = map.latLngToContainerPoint(centroid)
      // Shift centroid left by half panel width so it appears in the visible area
      const adjustedPt = map.containerPointToLatLng([
        containerPt.x - PANEL_WIDTH / 2,
        containerPt.y,
      ])
      map.panTo(adjustedPt, {
        animate:      true,
        duration:     0.32,   // matches panel slide-in duration
        easeLinearity: 0.25,
      })
    }, 50) // small delay so panel animation has started before map pans
    return () => clearTimeout(timer)
  }, [panelFsa, isDesktop])

  // Fetch once on mount
  useEffect(() => {
    const fetch = async () => {
      try {
        const { data, error } = await supabase
          .from('submissions')
          .select(`
            id,
            created_at,
            fsa,
            neighbourhood,
            provider,
            insurance_type,
            rate_change_pct,
            rate_change_dollar,
            mode,
            years_licensed,
            at_fault_claims,
            convictions,
            home_claims,
            sentiment,
            comment_raw,
            comment_explanation,
            comment_loyalty,
            comment_shopping,
            comment_tone,
            verified,
            renewal_year
          `)
          .order('created_at', { ascending: false })
          .limit(500)

        setSubmissions((data ?? []) as Submission[])

        if (error) {
          console.error('[MapView] fetch error:', error.message)
        }
      } catch (err) {
        console.error('Unexpected error fetching submissions:', err)
      } finally {
        setIsLoading(false)
        isInitialLoad.current = false
      }
    }
    fetch()
  }, [])


  const allWithCentroid = useMemo(
    () => submissions.filter(s => getCentroid(s.fsa) !== null),
    [submissions],
  )

  const matchCount = useMemo(
    () => allWithCentroid.filter(s => getMarkerMatchState(s, filters)).length,
    [allWithCentroid, filters],
  )

  useEffect(() => {
    onMatchCountChange?.(matchCount)
  }, [matchCount, onMatchCountChange])

  const cohortResult = useMemo(() => {
    if (!likeMeMode || !userProfile) return null
    return matchCohort(userProfile, submissions)
  }, [likeMeMode, userProfile, submissions])

  useEffect(() => {
    onCohortResult?.(cohortResult)
  }, [cohortResult, onCohortResult])

  const at = activeTooltip

  return (
    <>
      {/* Map — full viewport, always full width (Option B: panel overlaps right edge) */}
      <MapContainer
        center={[43.651, -79.383]}
        zoom={12}
        maxBounds={[[41.6, -95.2], [56.9, -74.3]]}
        maxBoundsViscosity={1.0}
        minZoom={6}
        maxZoom={16}
        zoomControl={false}
        attributionControl={false}
        style={{ position: 'fixed', inset: 0, zIndex: TOKENS.zIndex.zMap, /* --z-map: 0 ✓ */ width: '100vw', height: '100dvh', touchAction: 'none' }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          subdomains="abcd"
          maxZoom={19}
        />

        <MapSetup
          onExternalReady={onLeafletReady}
          onLocalMap={m => { localMapRef.current = m }}
          onDismiss={dismissAll}
        />

        {isLoading && SKELETON_COORDS.map((pos, i) => (
          <Marker key={`sk-${i}`} position={pos} icon={SKELETON_ICON} interactive={false} />
        ))}

        {!isLoading && allWithCentroid.map((s, idx) => {
          const pos     = getCentroid(s.fsa)! as [number, number]
          const isMatch = (likeMeMode && cohortResult)
            ? cohortResult.ids.has(s.id)
            : getMarkerMatchState(s, filters)
          return (
            <MapMarker
              key={s.id}
              s={s}
              icon={getCachedIcon(s)}
              pos={pos}
              isMatch={isMatch}
              staggerDelay={Math.min(idx * 8, 200)}
              mapRef={localMapRef}
              onMarkerEnter={onMarkerEnter}
              onMarkerLeave={onMarkerLeave}
              onMarkerClick={onMarkerClick}
            />
          )
        })}
      </MapContainer>

      {/* Mode 1 — hover preview (desktop only, auto-dismisses) */}
      <AnimatePresence>
        {at?.mode === 'preview' && (
          <HoverPreview
            key="hover-preview"
            sub={at.sub}
            x={at.x}
            y={at.y}
            isFirst={!tooltipEverShown.current}
            prefersReduced={prefersReduced}
            onMouseEnter={cancelHideTimer}
            onMouseLeave={startHideTimer}
            onFirstShown={() => { tooltipEverShown.current = true }}
            onNavigate={() => {
              cancelHideTimer()
              setActiveTooltip(null)
              handleEnvelopeClick(at.sub.fsa)
            }}
          />
        )}
      </AnimatePresence>

      {/* NeighbourhoodPanel — neighbourhood-aggregated bottom sheet */}
      <AnimatePresence>
        {panelFsa && (
          <NeighbourhoodPanel
            key="neighbourhood-panel"
            stats={panelStats}
            loading={panelLoading}
            fsa={panelFsa}
            isDesktop={isDesktop}
            onClose={closePanel}
            onCtaClick={(fsa) => {
              closePanel()
              onCtaClick?.(fsa)
            }}
          />
        )}
      </AnimatePresence>
    </>
  )
}
