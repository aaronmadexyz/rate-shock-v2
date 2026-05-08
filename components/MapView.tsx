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

// ─── Tooltip ─────────────────────────────────────────────────────────────────

interface TooltipState {
  sub:      Submission
  x:        number   // fixed screen x (marker anchor)
  y:        number   // fixed screen y (marker anchor)
  animated: boolean  // false when a tooltip is already visible → instant
}

function SentimentFace({ sentiment }: { sentiment: number }) {
  const color = sealColor(sentiment)
  const happy = sentiment <= 2
  const sad   = sentiment >= 4
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1"/>
      <circle cx="5.5" cy="7"  r="1" fill={color}/>
      <circle cx="10.5" cy="7" r="1" fill={color}/>
      {happy && (
        <path d="M5.5 10 Q8 12 10.5 10"
          stroke={color} strokeWidth="1.2" strokeLinecap="round" fill="none"/>
      )}
      {sad && (
        <path d="M5.5 11.5 Q8 9.5 10.5 11.5"
          stroke={color} strokeWidth="1.2" strokeLinecap="round" fill="none"/>
      )}
      {!happy && !sad && (
        <path d="M5.5 10.5 H10.5"
          stroke={color} strokeWidth="1.2" strokeLinecap="round"/>
      )}
    </svg>
  )
}

function EnvelopeTooltip({ data }: { data: TooltipState }) {
  const { sub, x, y, animated } = data
  const { prefersReduced } = useReducedMotion()
  const label = getAreaLabel(sub.fsa)
  const pct   = sub.rate_change_pct

  return (
    // Outer div: pure positioning — keeps motion transforms uncontaminated
    <div style={{
      position:      'fixed',
      left:          x,
      top:           y - 8,
      transform:     'translateX(-50%) translateY(-100%)',
      transformOrigin: 'bottom center',
      zIndex:        300,
      pointerEvents: 'none',
    }}>
      <motion.div
        initial={animated && !prefersReduced
          ? { opacity: 0, scale: 0.95, y: 4 }
          : false}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, transition: { duration: prefersReduced ? 0 : 0.08 } }}
        transition={prefersReduced
          ? { duration: 0 }
          : { duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        style={{
          transformOrigin: 'bottom center',
          background:      '#FFFFFF',
          border:          '1px solid #E2E1DD',
          borderRadius:    10,
          padding:         '10px 13px',
          boxShadow:       '0 4px 12px rgba(26,25,23,.08)',
          fontSize:        13,
          color:           '#1A1917',
          minWidth:        160,
          fontFamily:      "'Inter', system-ui, sans-serif",
          letterSpacing:   '-0.01em',
          lineHeight:      1.4,
          whiteSpace:      'nowrap',
        }}
      >
        {/* Neighbourhood */}
        <div style={{ fontWeight: 600, marginBottom: 2, color: '#1A1917' }}>
          {label}
        </div>

        {/* Provider */}
        <div style={{ color: '#9A998F', fontSize: 12, marginBottom: 6 }}>
          {sub.provider}
        </div>

        {/* Rate + sentiment face */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontWeight: 500,
            fontSize:   13,
            color:      pct != null && pct > 0 ? '#D4503A' : '#3A9B55',
          }}>
            {pct != null ? (pct >= 0 ? `+${pct}%` : `${pct}%`) : '—'}
          </span>
          <SentimentFace sentiment={sub.sentiment} />
        </div>

        {/* Verified badge */}
        {sub.verified && (
          <div style={{
            display:      'inline-flex',
            alignItems:   'center',
            gap:          4,
            marginTop:    6,
            fontSize:     11,
            fontWeight:   500,
            color:        '#3A3F8F',
            background:   '#EEEFFA',
            border:       '1px solid #B0B4E6',
            borderRadius: 999,
            padding:      '2px 8px',
          }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <path d="M2 5l2.5 2.5L8 3"
                stroke="#3A3F8F" strokeWidth="1.4"
                strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Verified
          </div>
        )}
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
}

export default function MapView({ filters, onReady, onLeafletReady, likeMeMode = false, userProfile = null, onCohortResult }: MapViewProps) {
  const [submissions,  setSubmissions]  = useState<Submission[]>([])
  const [isLoading,    setIsLoading]    = useState(true)
  const [tooltipState, setTooltipState] = useState<TooltipState | null>(null)

  const localMapRef       = useRef<L.Map | null>(null)
  const tooltipVisibleRef = useRef(false)
  const hideTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Dismiss immediately — used by map click / pan / zoom
  const clearTooltip = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    setTooltipState(null)
    tooltipVisibleRef.current = false
  }, [])

  // Show tooltip at marker's screen-space anchor
  const showTooltip = useCallback((sub: Submission, x: number, y: number) => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    setTooltipState({
      sub,
      x,
      y,
      animated: !tooltipVisibleRef.current, // instant if one is already showing
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
          .select('id, fsa, provider, insurance_type, rate_change_pct, sentiment, verified, created_at, years_licensed, at_fault_claims, convictions, home_claims')
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
          // Stable key so content updates in-place (no exit/enter) when moving between markers.
          // Only disappears + reappears when the tooltip was fully dismissed first.
          <EnvelopeTooltip key="map-tooltip" data={tooltipState} />
        )}
      </AnimatePresence>
    </>
  )
}
