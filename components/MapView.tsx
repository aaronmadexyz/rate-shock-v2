'use client'

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '@/lib/supabase'
import { getCentroid } from '@/lib/fsaCentroids'
import type { FilterState } from '@/components/FilterSheet'
import type { Submission, MapViewHandle } from '@/lib/types'

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
  // Bob animation on an inner div so translateY doesn't fight the outer scale transform.
  // duration=0 means no animation (used for skeleton markers).
  const bobStyle = duration > 0
    ? `animation:envelopeBob ${duration}ms ease-in-out infinite;animation-delay:${delay}ms;`
    : ''
  const html =
    `<div style="width:${W}px;height:${H}px;transform:scale(${scale.toFixed(3)});transform-origin:bottom center;overflow:visible">` +
    `<div class="envelope-marker" style="${bobStyle}">` +
    `<svg width="${W}" height="${H}" viewBox="0 0 40 28" fill="none" style="display:block;overflow:visible">` +
    `<rect x="0.5" y="0.5" width="39" height="27" rx="2.5" fill="${fill}" stroke="#D4D3CE" stroke-width="0.8"/>` +
    `<polygon points="0,0 40,0 20,15" fill="#E8E4DD" opacity="0.8"/>` +
    `<circle cx="20" cy="6.5" r="4" fill="${seal}"/>` +
    `</svg></div></div>`
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

// ─── Filter ───────────────────────────────────────────────────────────────────

function applyFilters(subs: Submission[], f: FilterState): Submission[] {
  return subs.filter(s => {
    if (!f.types.auto && s.insurance_type === 'auto') return false
    if (!f.types.home && s.insurance_type === 'home') return false
    if (f.provs.length > 0 && !f.provs.includes(s.provider)) return false
    const pct = s.rate_change_pct ?? 0
    if (pct < f.rMin || pct > f.rMax) return false
    if (f.verified && !s.verified) return false
    return true
  })
}

// ─── Map bridge — captures the Leaflet instance for use outside MapContainer ──

function MapBridge({ onReady }: { onReady?: (map: L.Map) => void }) {
  const map = useMap()
  const cbRef = useRef(onReady)
  useEffect(() => { cbRef.current?.(map) }, [map])
  return null
}

// ─── Component ────────────────────────────────────────────────────────────────

interface MapViewProps {
  filters:         FilterState
  onReady?:        (handle: MapViewHandle) => void
  onLeafletReady?: (map: L.Map) => void
}

export default function MapView({ filters, onReady, onLeafletReady }: MapViewProps) {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [isLoading,   setIsLoading]   = useState(true)

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

  // Stable handle exposed via onReady — lets page.tsx prepend without a re-fetch
  const prependSubmission = useCallback((sub: Submission) => {
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
          .select('id, fsa, provider, insurance_type, rate_change_pct, sentiment, verified, created_at')
          .order('created_at', { ascending: false })
          .limit(500)
        if (data)  setSubmissions(data as Submission[])
        if (error) console.error('Supabase error:', error)
      } catch (err) {
        console.error('Failed to fetch submissions:', err)
      } finally {
        setIsLoading(false)
      }
    }
    fetchSubmissions()
  }, [])

  const visible = useMemo(
    () => applyFilters(submissions, filters).filter(s => getCentroid(s.fsa) !== null),
    [submissions, filters],
  )

  return (
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

      {/* Captures the Leaflet map instance and forwards it to MapControls */}
      <MapBridge onReady={onLeafletReady} />

      {/* Skeleton markers while the fetch is in flight */}
      {isLoading && SKELETON_COORDS.map((pos, i) => (
        <Marker key={`sk-${i}`} position={pos} icon={SKELETON_ICON} interactive={false} />
      ))}

      {/* Real markers once loaded */}
      {!isLoading && visible.map(s => (
        <Marker
          key={s.id}
          position={getCentroid(s.fsa)!}
          icon={getCachedIcon(s)}
        />
      ))}
    </MapContainer>
  )
}
