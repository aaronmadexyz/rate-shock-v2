'use client'

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import { AnimatePresence, motion } from 'framer-motion'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '@/lib/supabase'
import { getCentroid } from '@/lib/fsaCentroids'
import { getAreaLabel } from '@/lib/fsaData'
import { useReducedMotion } from '@/lib/motionSafety'
import { safeGetItem } from '@/lib/storage'
import { playChime } from '@/lib/sounds'
import type { FilterState } from '@/lib/types'
import type { Submission, MapViewHandle, UserProfile } from '@/lib/types'
import { matchCohort } from '@/lib/cohortMatch'
import type { CohortResult } from '@/lib/cohortMatch'

// ─── Leaflet default-icon fix ─────────────────────────────────────────────────
// Next.js webpack can't resolve the default icon paths that Leaflet hard-codes.
// We use only divIcons, but the fix must be applied globally to prevent warnings.
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

function sealColor(sentiment: number): string {
  if (sentiment <= 2) return '#3A9B55'
  if (sentiment === 3) return '#D49316'
  return '#D4503A'
}

function markerScale(pct: number | null): number {
  const clamped = Math.min(50, Math.max(0, pct ?? 25))
  return 0.6 + (clamped / 50) * 0.8
}

function buildIcon(fill: string, seal: string, scale: number, duration = 0, delay = 0): L.DivIcon {
  const W = 40, H = 28
  // Bob animation on .envelope-marker so translateY doesn't fight the size-scale transform.
  // .env-hover-wrap is the outermost layer — CSS :hover scale lives there (globals.css).
  const bobStyle = duration > 0
    ? `animation:envelopeBob ${duration}ms ease-in-out infinite;animation-delay:${delay}ms;`
    : ''
  const html =
    `<div class="env-hover-wrap" style="display:inline-block;transform-origin:bottom center">` +
    `<div style="width:${W}px;height:${H}px;transform:scale(${scale.toFixed(3)});transform-origin:bottom center;overflow:visible">` +
    `<div class="envelope-marker" style="${bobStyle}">` +
    `<svg width="${W}" height="${H}" viewBox="0 0 40 28" fill="none" style="display:block;overflow:visible">` +
    `<rect x="0.5" y="0.5" width="39" height="27" rx="2.5" fill="${fill}" stroke="#D4D3CE" stroke-width="0.8"/>` +
    `<polygon points="0,0 40,0 20,15" fill="#E8E4DD" opacity="0.8"/>` +
    `<circle cx="20" cy="6.5" r="4" fill="${seal}"/>` +
    `</svg></div></div></div>`
  return L.divIcon({
    html,
    className:  '',
    iconSize:   [W * scale, H * scale],
    iconAnchor: [(W * scale) / 2, H * scale],
  })
}

function makeIcon(s: Submission, duration: number, delay: number): L.DivIcon {
  return buildIcon('#F0EDE8', sealColor(s.sentiment), markerScale(s.rate_change_pct), duration, delay)
}

const SKELETON_ICON = buildIcon('#EEEDEA', '#D4D3CE', 1.0) // no animation

// ─── Skeleton coordinates — spread across Toronto for visual feedback ─────────
const SKELETON_COORDS: Array<[number, number]> = [
  [43.651, -79.383], [43.660, -79.395], [43.642, -79.371], [43.670, -79.410],
  [43.633, -79.420], [43.680, -79.355], [43.645, -79.440], [43.655, -79.365],
]

// ─── Filter matching ──────────────────────────────────────────────────────────

function getMarkerMatchState(s: Submission, f: FilterState): boolean {
  if (!f.types.auto && s.insurance_type === 'auto') return false
  if (!f.types.home && s.insurance_type === 'home') return false
  if (f.provs.length > 0 && !f.provs.includes(s.provider)) return false
  const pct = s.rate_change_pct ?? 0
  if (pct < f.rMin || pct > f.rMax) return false
  if (f.verified && !s.verified) return false
  return true
}

// ─── Map setup — inside MapContainer ─────────────────────────────────────────
// Captures the Leaflet instance, forwards it to callers, and registers
// click/pan/zoom events that dismiss the tooltip.

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

const SENTIMENT_COLORS: Record<number, string> = {
  1: '#3A9B55',
  2: '#93D1A2',
  3: '#D49316',
  4: '#E87460',
  5: '#D4503A',
}

function rateColor(sentiment: number): string {
  if (sentiment <= 2) return '#2A7D41'
  if (sentiment === 3) return '#AD7710'
  return '#B33C28'
}

function SentimentFace28({ sentiment }: { sentiment: number }) {
  const color = SENTIMENT_COLORS[sentiment] ?? '#9A998F'
  const happy = sentiment <= 2
  const sad   = sentiment >= 4
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <circle cx="14" cy="14" r="12" fill={color} fillOpacity="0.15" stroke={color} strokeWidth="1.2"/>
      <circle cx="9.5"  cy="12.5" r="1.5" fill={color}/>
      <circle cx="18.5" cy="12.5" r="1.5" fill={color}/>
      {happy && (
        <path d="M9.5 17.5 Q14 21 18.5 17.5"
          stroke={color} strokeWidth="1.4" strokeLinecap="round" fill="none"/>
      )}
      {sad && (
        <path d="M9.5 20.5 Q14 17 18.5 20.5"
          stroke={color} strokeWidth="1.4" strokeLinecap="round" fill="none"/>
      )}
      {!happy && !sad && (
        <path d="M9.5 19 H18.5"
          stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
      )}
    </svg>
  )
}

interface FsaStats { median: number; count: number }

function getContextLine(
  s: Submission,
  stats: FsaStats | undefined,
  areaLabel: string,
): { text: string; color: string } {
  const rate = s.rate_change_pct
  if (!stats || stats.count < 3 || rate == null) {
    const n = stats?.count ?? 1
    return { text: `One of ${n} report${n !== 1 ? 's' : ''} here`, color: '#9A998F' }
  }
  if (rate > stats.median) return { text: `↑ Above ${areaLabel} average`, color: '#B33C28' }
  if (rate < stats.median) return { text: `↓ Below ${areaLabel} average`, color: '#2A7D41' }
  return { text: 'Around the area average', color: '#9A998F' }
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

interface TooltipState {
  sub:      Submission
  x:        number
  y:        number
  animated: boolean  // true only for the first ever tooltip in this session
}

interface EnvelopeTooltipProps {
  data:          TooltipState
  fsaMedians:    Map<string, FsaStats>
  viewerFsa:     string | null
  onCtaClick?:   () => void
  onFirstShown?: () => void
}

function EnvelopeTooltip({ data, fsaMedians, viewerFsa, onCtaClick, onFirstShown }: EnvelopeTooltipProps) {
  const { sub, x, y, animated } = data
  const { prefersReduced } = useReducedMotion()

  const isViewerArea  = viewerFsa != null && sub.fsa.toUpperCase() === viewerFsa.toUpperCase()
  const displayLabel  = isViewerArea ? 'Your area' : getAreaLabel(sub.fsa)
  const contextLabel  = getAreaLabel(sub.fsa)
  const pct           = sub.rate_change_pct
  const pctStr        = pct != null ? (pct >= 0 ? `+${pct}%` : `${pct}%`) : '–'
  const ctx           = getContextLine(sub, fsaMedians.get(sub.fsa), contextLabel)

  const rawComment    = sub.comment_raw?.trim() ?? ''
  const commentExcerpt = rawComment
    ? (rawComment.length > 60 ? rawComment.substring(0, 60) + '…' : rawComment)
    : null

  return (
    <div style={{
      position:        'fixed',
      left:            x,
      top:             y - 8,
      transform:       'translateX(-50%) translateY(-100%)',
      transformOrigin: 'bottom center',
      zIndex:          300,
      pointerEvents:   'none',
      willChange:      'transform',
    }}>
      <motion.div
        initial={animated && !prefersReduced
          ? { opacity: 0, scale: 0.95, y: 4 }
          : false}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, transition: { duration: prefersReduced ? 0 : 0.08, ease: [0.4, 0, 1, 1] as [number, number, number, number] } }}
        transition={animated && !prefersReduced
          ? { type: 'spring', stiffness: 400, damping: 28, mass: 0.8, delay: 0.1 }
          : { duration: 0 }}
        onAnimationComplete={() => onFirstShown?.()}
        style={{
          transformOrigin: 'bottom center',
          background:      '#FFFFFF',
          borderTop:       '1px solid #E2E1DD',
          borderRight:     '1px solid #E2E1DD',
          borderBottom:    '1px solid #E2E1DD',
          borderLeft:      isViewerArea ? '3px solid #4A50B0' : '1px solid #E2E1DD',
          borderRadius:    12,
          padding:         '12px 14px',
          paddingLeft:     isViewerArea ? 11 : 14,
          boxShadow:       '0 4px 12px rgba(26,25,23,.06), 0 1px 3px rgba(26,25,23,.04)',
          minWidth:        200,
          maxWidth:        240,
          fontFamily:      "'Inter', system-ui, sans-serif",
          letterSpacing:   '-0.01em',
          fontSize:        13,
          color:           '#1A1917',
        }}
      >
        {/* Rule 7 — blur crossfade when content changes between markers */}
        <AnimatePresence mode="wait">
          <motion.div
            key={sub.id}
            initial={{ filter: 'blur(2px)', opacity: 0 }}
            animate={{ filter: 'blur(0px)', opacity: 1 }}
            exit={{ filter: 'blur(2px)', opacity: 0 }}
            transition={{ duration: prefersReduced ? 0 : 0.06 }}
          >
            {/* Section 1 — Header */}
            <div style={{ fontSize: 13, fontWeight: 500, color: '#1A1917', lineHeight: 1.2 }}>
              {displayLabel}
            </div>
            <div style={{ fontSize: 11, color: '#9A998F', fontWeight: 400, marginTop: 2 }}>
              {sub.provider} · {sub.insurance_type === 'auto' ? 'Auto' : 'Home'}
            </div>

            {/* Section 2 — Number */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 10 }}>
              <SentimentFace28 sentiment={sub.sentiment} />
              <div>
                <div style={{
                  fontSize:              26,
                  fontWeight:            700,
                  fontVariationSettings: "'opsz' 32",
                  letterSpacing:         '-0.02em',
                  fontVariantNumeric:    'tabular-nums',
                  color:                 rateColor(sub.sentiment),
                  lineHeight:            1,
                }}>
                  {pctStr}
                </div>
                <div style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize:   11,
                  fontWeight: 500,
                  color:      ctx.color,
                  marginTop:  4,
                  lineHeight: 1.4,
                }}>
                  {ctx.text}
                </div>
              </div>
            </div>

            {/* Section 3 — Comment excerpt */}
            {commentExcerpt && (
              <div style={{
                borderTop:  '1px solid #EEEDEA',
                paddingTop: 8,
                marginTop:  8,
                fontSize:   12,
                color:      '#5E5D56',
                lineHeight: 1.5,
                fontStyle:  'italic',
              }}>
                &#8220;{commentExcerpt}
              </div>
            )}

            {/* Verified badge */}
            {sub.verified && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M2 6l3 3 5-5" stroke="#1F6132"
                        strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span style={{ fontSize: 11, fontWeight: 500, color: '#1F6132' }}>
                  Verified renewal
                </span>
              </div>
            )}

            {/* CTA */}
            <div
              role="button"
              tabIndex={0}
              onClick={onCtaClick}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onCtaClick?.() }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#3A3F8F' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#9A998F' }}
              style={{ fontSize: 11, color: '#9A998F', marginTop: 8, cursor: 'pointer', pointerEvents: 'all' }}
            >
              See how yours compares →
            </div>
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

// ─── Individual marker — handles match/dim class updates via DOM ref ──────────

interface MapMarkerProps {
  s:           Submission
  icon:        L.DivIcon
  pos:         [number, number]
  isMatch:     boolean
  delay:       number
  mapRef:      React.MutableRefObject<L.Map | null>
  showTooltip: (sub: Submission, x: number, y: number) => void
  onHideStart: () => void
}

function MapMarker({ s, icon, pos, isMatch, delay, mapRef, showTooltip, onHideStart }: MapMarkerProps) {
  const markerRef    = useRef<L.Marker>(null)
  const prevMatchRef = useRef<boolean | null>(null)

  useEffect(() => {
    const el   = markerRef.current?.getElement()
    const wrap = el?.querySelector<HTMLElement>('.env-hover-wrap')
    if (!el || !wrap) return

    const wasMatch = prevMatchRef.current
    prevMatchRef.current = isMatch

    wrap.style.transitionDelay = `${delay}ms`

    if (isMatch) {
      el.style.pointerEvents = ''
      wrap.classList.remove('marker-dim')
      wrap.classList.add('marker-match')
      // Entrance pulse only when transitioning dim → match (not on initial mount)
      if (wasMatch === false) {
        wrap.classList.remove('marker-pulse')
        void wrap.offsetWidth // force reflow to restart animation
        wrap.classList.add('marker-pulse')
        const t = setTimeout(() => wrap.classList.remove('marker-pulse'), 350)
        return () => clearTimeout(t)
      }
    } else {
      el.style.pointerEvents = 'none'
      wrap.classList.remove('marker-match', 'marker-pulse')
      wrap.classList.add('marker-dim')
    }
  }, [isMatch, delay])

  return (
    <Marker
      ref={markerRef as React.Ref<L.Marker>}
      position={pos}
      icon={icon}
      eventHandlers={{
        mouseover: () => {
          const map = mapRef.current
          if (!map) return
          const pt   = map.latLngToContainerPoint(pos)
          const rect = map.getContainer().getBoundingClientRect()
          showTooltip(s, rect.left + pt.x, rect.top + pt.y)
        },
        mouseout: onHideStart,
      }}
    />
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

interface MapViewProps {
  filters:          FilterState
  onReady?:         (handle: MapViewHandle) => void
  onLeafletReady?:  (map: L.Map) => void
  likeMeMode?:      boolean
  userProfile?:     UserProfile | null
  onCohortResult?:  (result: CohortResult | null) => void
  onCtaClick?:      () => void
}

export default function MapView({ filters, onReady, onLeafletReady, likeMeMode = false, userProfile = null, onCohortResult, onCtaClick }: MapViewProps) {
  const [submissions,  setSubmissions]  = useState<Submission[]>([])
  const [isLoading,    setIsLoading]    = useState(true)
  const [tooltipState, setTooltipState] = useState<TooltipState | null>(null)
  const [viewerFsa,    setViewerFsa]    = useState<string | null>(null)

  const localMapRef       = useRef<L.Map | null>(null)
  const tooltipVisibleRef = useRef(false)
  const hideTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipEverShown  = useRef(false)

  // isInitialLoad: true during the first Supabase fetch, false thereafter.
  // Guards playChime so it only fires for new user-submitted markers, not map load.
  const isInitialLoad     = useRef(true)
  const { prefersReduced } = useReducedMotion()
  const prefersReducedRef  = useRef(prefersReduced)
  prefersReducedRef.current = prefersReduced

  // Per-marker bob timing + icon cache — keyed by submission id.
  // Computed once on first encounter so filter changes don't reset the animation.
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

  // Read viewer FSA from localStorage (client-side only)
  useEffect(() => {
    setViewerFsa(safeGetItem('ratemap_last_fsa'))
  }, [])

  // Dismiss immediately — used by map click / pan / zoom
  const clearTooltip = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    setTooltipState(null)
    tooltipVisibleRef.current = false
  }, [])

  // Show tooltip at marker's screen-space anchor.
  // animated = true only for the very first tooltip in this session (Rule 3).
  const showTooltip = useCallback((sub: Submission, x: number, y: number) => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    setTooltipState({
      sub,
      x,
      y,
      animated: !tooltipEverShown.current && !prefersReducedRef.current,
    })
    tooltipVisibleRef.current = true
  }, [])

  // 50ms grace period — cancelled if user moves to another marker before it fires.
  // This prevents a flicker when moving directly between adjacent markers.
  const startHideTooltip = useCallback(() => {
    hideTimerRef.current = setTimeout(() => {
      setTooltipState(null)
      tooltipVisibleRef.current = false
    }, 50)
  }, [])

  // Stable handle exposed via onReady — lets page.tsx prepend without a re-fetch
  const prependSubmission = useCallback((sub: Submission) => {
    if (!isInitialLoad.current && !prefersReducedRef.current) playChime()
    setSubmissions(prev =>
      prev.some(s => s.id === sub.id) ? prev : [sub, ...prev],
    )
  }, [])

  useEffect(() => {
    onReady?.({ prependSubmission })
  }, [onReady, prependSubmission])

  // Fetch once on mount — all filtering done in-memory from here on
  useEffect(() => {
    const fetchSubmissions = async () => {
      try {
        const { data, error } = await supabase
          .from('submissions')
          .select('id, fsa, provider, insurance_type, rate_change_pct, sentiment, verified, created_at, comment_raw, years_licensed, at_fault_claims, convictions, home_claims')
          .order('created_at', { ascending: false })
          .limit(500)

        if (error) console.error('Supabase fetch error:', error)
        if (data) setSubmissions(data as Submission[])
      } catch (err) {
        console.error('Unexpected error fetching submissions:', err)
      } finally {
        setIsLoading(false)
        isInitialLoad.current = false
      }
    }

    fetchSubmissions()
  }, [])

  // FSA median map — used by tooltip context line
  const fsaMedians = useMemo(() => {
    const byFsa = new Map<string, number[]>()
    for (const s of submissions) {
      if (s.rate_change_pct != null) {
        const arr = byFsa.get(s.fsa) ?? []
        arr.push(s.rate_change_pct)
        byFsa.set(s.fsa, arr)
      }
    }
    const result = new Map<string, FsaStats>()
    for (const [fsa, vals] of byFsa) {
      const sorted = [...vals].sort((a, b) => a - b)
      const mid    = Math.floor(sorted.length / 2)
      const median = sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid]
      result.set(fsa, { median, count: sorted.length })
    }
    return result
  }, [submissions])

  // All loaded submissions that have a known centroid — rendered regardless of filter state.
  // Match/dim treatment is applied via DOM class updates in MapMarker.
  const allWithCentroid = useMemo(
    () => submissions.filter(s => getCentroid(s.fsa) !== null),
    [submissions],
  )

  // Cohort result — recomputed whenever submissions, mode, or profile changes.
  const cohortResult = useMemo(() => {
    if (!likeMeMode || !userProfile) return null
    return matchCohort(userProfile, submissions)
  }, [likeMeMode, userProfile, submissions])

  useEffect(() => {
    onCohortResult?.(cohortResult)
  }, [cohortResult, onCohortResult])

  return (
    <>
      <MapContainer
        center={[43.651, -79.383]}
        zoom={10}
        maxBounds={[[41.6, -95.2], [56.9, -74.3]]}
        maxBoundsViscosity={1.0}
        minZoom={6}
        maxZoom={16}
        zoomControl={false}
        style={{ position: 'fixed', inset: 0, zIndex: 0, width: '100vw', height: '100vh' }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          subdomains="abcd"
          maxZoom={19}
        />

        {/* Captures map instance, forwards to external caller, dismisses tooltip on map interaction */}
        <MapSetup
          onExternalReady={onLeafletReady}
          onLocalMap={m => { localMapRef.current = m }}
          onDismiss={clearTooltip}
        />

        {/* Skeleton markers while fetch is in flight */}
        {isLoading && SKELETON_COORDS.map((pos, i) => (
          <Marker key={`sk-${i}`} position={pos} icon={SKELETON_ICON} interactive={false} />
        ))}

        {/* Real markers once loaded — all are rendered; non-matching ones are dimmed */}
        {!isLoading && allWithCentroid.map((s, idx) => {
          const pos     = getCentroid(s.fsa)! as [number, number]
          const isMatch = (likeMeMode && cohortResult)
            ? cohortResult.ids.has(s.id)
            : getMarkerMatchState(s, filters)
          const delay   = Math.min(idx * 8, 200)
          return (
            <MapMarker
              key={s.id}
              s={s}
              icon={getCachedIcon(s)}
              pos={pos}
              isMatch={isMatch}
              delay={delay}
              mapRef={localMapRef}
              showTooltip={showTooltip}
              onHideStart={startHideTooltip}
            />
          )
        })}
      </MapContainer>

      {/* Tooltip rendered outside MapContainer so it isn't clipped by the map */}
      <AnimatePresence>
        {tooltipState && (
          // Stable key so the card never exits/enters when moving between markers.
          // Content blur-crossfades inside via AnimatePresence key={sub.id} (Rule 7).
          // The card itself only exits when tooltipState becomes null.
          <EnvelopeTooltip
            key="map-tooltip"
            data={tooltipState}
            fsaMedians={fsaMedians}
            viewerFsa={viewerFsa}
            onCtaClick={onCtaClick}
            onFirstShown={() => { tooltipEverShown.current = true }}
          />
        )}
      </AnimatePresence>
    </>
  )
}
