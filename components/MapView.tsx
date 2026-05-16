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
  const bobStyle = duration > 0
    ? `animation:envelopeBob ${duration}ms ease-in-out infinite;animation-delay:${delay}ms;`
    : ''
  const html =
    `<div class="env-hover-wrap" style="display:inline-block;transform-origin:bottom center">` +
    `<div style="width:${W}px;height:${H}px;transform:scale(${scale.toFixed(3)});transform-origin:bottom center;overflow:visible">` +
    `<div class="envelope-marker" style="will-change:transform;${bobStyle}">` +
    `<svg width="${W}" height="${H}" viewBox="0 0 40 28" fill="none" style="display:block;overflow:visible">` +
    `<rect x="0.5" y="0.5" width="39" height="27" rx="2.5" fill="${fill}" stroke="#D4D3CE" stroke-width="0.8"/>` +
    `<polygon points="0,0 40,0 20,15" fill="#E8E4DD" opacity="0.8"/>` +
    `<circle cx="20" cy="6.5" r="4" fill="${seal}"/>` +
    `</svg></div></div></div>`
  return L.divIcon({ html, className: '', iconSize: [W * scale, H * scale], iconAnchor: [(W * scale) / 2, H * scale] })
}

function makeIcon(s: Submission, duration: number, delay: number): L.DivIcon {
  return buildIcon('#F0EDE8', sealColor(s.sentiment), markerScale(s.rate_change_pct), duration, delay)
}

const SKELETON_ICON = buildIcon('#EEEDEA', '#D4D3CE', 1.0)

// ─── Skeleton coordinates ─────────────────────────────────────────────────────
const SKELETON_COORDS: Array<[number, number]> = [
  [43.651, -79.383], [43.660, -79.395], [43.642, -79.371], [43.670, -79.410],
  [43.633, -79.420], [43.680, -79.355], [43.645, -79.440], [43.655, -79.365],
]

// ─── Filter matching ──────────────────────────────────────────────────────────
// UNCHANGED

function getMarkerMatchState(s: Submission, f: FilterState): boolean {
  if (!f.types.auto && s.insurance_type === 'auto') return false
  if (!f.types.home && s.insurance_type === 'home') return false
  if (f.provs.length > 0 && !f.provs.includes(s.provider)) return false
  const pct = s.rate_change_pct ?? 0
  if (pct < f.rMin || pct > f.rMax) return false
  if (f.verified && !s.verified) return false
  return true
}

// ─── Attribution fix ──────────────────────────────────────────────────────────

function AttributionFix() {
  const map = useMap()
  useEffect(() => {
    const container = map.attributionControl?.getContainer()
    if (!container) return
    const el = container as HTMLElement
    const offset = window.innerWidth <= 680 ? 72 : 80
    el.style.marginBottom = `${offset}px`
    el.style.position = 'relative'
    el.style.zIndex = '20'
    function onResize() {
      el.style.marginBottom = `${window.innerWidth <= 680 ? 72 : 80}px`
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [map])
  return null
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

const SENTIMENT_COLORS: Record<number, string> = {
  1: '#3A9B55', 2: '#93D1A2', 3: '#D49316', 4: '#E87460', 5: '#D4503A',
}

function rateColor(sentiment: number): string {
  if (sentiment <= 2) return '#2A7D41'
  if (sentiment === 3) return '#AD7710'
  return '#B33C28'
}

// Sentiment face — exact filled-circle style from the submission form.
// Panel uses size=32; preview uses size=20 (same SVG scaled down).
function SentimentFace({ sentiment, size }: { sentiment: number; size: number }) {
  if (sentiment === 1) return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r="15" fill="#3A9B55"/>
      <circle cx="12" cy="14" r="2" fill="white"/>
      <circle cx="22" cy="14" r="2" fill="white"/>
      <path d="M10 21Q17 27 24 21" stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
    </svg>
  )
  if (sentiment === 2) return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r="15" fill="#93D1A2"/>
      <circle cx="12" cy="14" r="2" fill="#1F6132"/>
      <circle cx="22" cy="14" r="2" fill="#1F6132"/>
      <path d="M12 21Q17 24.5 22 21" stroke="#1F6132" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
    </svg>
  )
  if (sentiment === 3) return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r="15" fill="#D49316"/>
      <circle cx="12" cy="14" r="2" fill="white"/>
      <circle cx="22" cy="14" r="2" fill="white"/>
      <path d="M12 22L22 22" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  )
  if (sentiment === 4) return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r="15" fill="#E87460"/>
      <circle cx="12" cy="14" r="2" fill="white"/>
      <circle cx="22" cy="14" r="2" fill="white"/>
      <path d="M12 24Q17 20 22 24" stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
    </svg>
  )
  // sentiment 5
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r="15" fill="#D4503A"/>
      <circle cx="12" cy="13" r="2" fill="white"/>
      <circle cx="22" cy="13" r="2" fill="white"/>
      <path d="M10 24Q17 19 24 24" stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
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
    return { text: `One of ${n} report${n !== 1 ? 's' : ''} here`, color: 'var(--n-400)' }
  }
  if (rate > stats.median) return { text: `↑ Above ${areaLabel} average`, color: '#B33C28' }
  if (rate < stats.median) return { text: `↓ Below ${areaLabel} average`, color: '#2A7D41' }
  return { text: 'Around the area average', color: 'var(--n-400)' }
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
}

function HoverPreview({
  sub, x, y, isFirst, prefersReduced, onMouseEnter, onMouseLeave, onFirstShown,
}: HoverPreviewProps) {
  const label  = getAreaLabel(sub.fsa)
  const pct    = pctString(sub.rate_change_pct)

  return (
    <motion.div
      className={styles.preview}
      style={{
        position:        'fixed',
        left:            x,
        top:             y - 8,
        transform:       'translateX(-50%) translateY(-100%)',
        transformOrigin: 'bottom center',
        zIndex:          300,
      }}
      initial={isFirst && !prefersReduced
        ? { opacity: 0, scale: 0.95, y: 4 }
        : { opacity: 0 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0,
              transition: { duration: prefersReduced ? 0.15 : 0.08,
                            ease: [0.4, 0, 1, 1] as [number,number,number,number] } }}
      transition={isFirst && !prefersReduced
        ? { type: 'spring', stiffness: 400, damping: 28, mass: 0.8, delay: 0.1 }
        : { duration: 0 }}
      onAnimationComplete={() => { if (isFirst) onFirstShown() }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
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
      <span style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize:   10,
        color:      '#B8B7B1',
        marginLeft: 6,
      }}>
        · click for details
      </span>
      {/* 12px invisible bridge — prevents dismiss flicker when cursor crosses gap */}
      <div
        className={styles.bridge}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />
    </motion.div>
  )
}

// ─── PanelContent — shared between desktop panel + mobile sheet ───────────────

interface PanelContentProps {
  sub:            Submission
  fsaMedians:     Map<string, FsaStats>
  viewerFsa:      string | null
  prefersReduced: boolean
  onClose:        () => void
  onCtaClick:     () => void
}

function PanelContent({
  sub, fsaMedians, viewerFsa, prefersReduced, onClose, onCtaClick,
}: PanelContentProps) {
  const isViewerArea   = viewerFsa != null && sub.fsa.toUpperCase() === viewerFsa.toUpperCase()
  const displayLabel   = isViewerArea ? 'Your area' : getAreaLabel(sub.fsa)
  const shortLabel     = getAreaLabel(sub.fsa).replace(/\s*\(.*\)/, '')
  const ctx            = getContextLine(sub, fsaMedians.get(sub.fsa), shortLabel)
  const rawComment     = sub.comment_raw?.trim() ?? ''
  const commentExcerpt = rawComment
    ? (rawComment.length > 80 ? rawComment.substring(0, 80) + '…' : rawComment)
    : null

  return (
    // Rule 7 — blur crossfade when active submission changes while panel stays open
    <AnimatePresence mode="wait">
      <motion.div
        key={sub.id}
        initial={{ filter: 'blur(2px)', opacity: 0 }}
        animate={{ filter: 'blur(0px)', opacity: 1,
                   transition: { duration: prefersReduced ? 0 : 0.1 } }}
        exit={{ filter: 'blur(2px)', opacity: 0,
                transition: { duration: prefersReduced ? 0 : 0.06 } }}
      >
        {/* Section 1 — Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ marginRight: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#1A1917', lineHeight: 1.2 }}>
              {displayLabel}
            </div>
            <div style={{ fontSize: 11, color: 'var(--n-400)', fontWeight: 400, marginTop: 2 }}>
              {sub.provider} · {sub.insurance_type === 'auto' ? 'Auto' : 'Home'}
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close panel">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <path d="M1.5 1.5l7 7M8.5 1.5l-7 7"
                    stroke="#767670" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Section 2 — Rate + context */}
        <div className={styles.divider} />
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <SentimentFace sentiment={sub.sentiment} size={32} />
          <div>
            <div style={{
              fontVariationSettings: "'opsz' 32",
              fontSize:              26,
              fontWeight:            700,
              letterSpacing:         '-0.02em',
              fontVariantNumeric:    'tabular-nums',
              color:                 rateColor(sub.sentiment),
              lineHeight:            1,
            }}>
              {pctString(sub.rate_change_pct)}
            </div>
            <div className={styles.contextLine} style={{ color: ctx.color }}>
              {ctx.text}
            </div>
          </div>
        </div>

        {/* Section 3 — Comment (conditional) */}
        {commentExcerpt && (
          <>
            <div className={styles.divider} />
            <div style={{ fontSize: 12, color: '#5E5D56', lineHeight: 1.55, fontStyle: 'italic' }}>
              <span style={{ color: '#B8B7B1' }}>&#8220;</span>{commentExcerpt}
            </div>
          </>
        )}

        {/* Section 4 — Verified badge (conditional) */}
        {sub.verified && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M2 6l3 3 5-5" stroke="#1F6132"
                    strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{ fontSize: 11, fontWeight: 500, color: '#1F6132' }}>Verified renewal</span>
          </div>
        )}

        {/* Section 5 — CTA */}
        <div className={styles.divider} />
        <button
          className={styles.ctaBtn}
          onClick={() => { onCtaClick(); onClose() }}
        >
          <span>See how yours compares</span>
          <span aria-hidden="true">→</span>
        </button>
      </motion.div>
    </AnimatePresence>
  )
}

// ─── LockedPanel — Mode 2 (desktop panel + mobile sheet) ─────────────────────

interface LockedPanelProps {
  sub:            Submission
  x:              number
  y:              number
  fsaMedians:     Map<string, FsaStats>
  viewerFsa:      string | null
  prefersReduced: boolean
  isMobile:       boolean
  onClose:        () => void
  onCtaClick:     () => void
}

function LockedPanel({
  sub, x, y, fsaMedians, viewerFsa, prefersReduced, isMobile, onClose, onCtaClick,
}: LockedPanelProps) {
  const sheetRef      = useRef<HTMLDivElement>(null)
  const touchStartY   = useRef(0)
  const touchDelta    = useRef(0)

  // Escape key dismisses on desktop
  useEffect(() => {
    if (isMobile) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isMobile, onClose])

  const isViewerArea = viewerFsa != null && sub.fsa.toUpperCase() === viewerFsa.toUpperCase()

  const borderLeft  = isViewerArea ? '3px solid #4A50B0' : '1px solid #E2E1DD'
  const paddingLeft = isViewerArea ? 11 : 16

  // Touch gesture handlers for swipe-down dismissal
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
    touchDelta.current  = 0
    if (sheetRef.current) sheetRef.current.style.transition = ''
  }

  const onTouchMove = (e: React.TouchEvent) => {
    const delta = e.touches[0].clientY - touchStartY.current
    touchDelta.current = delta
    if (delta > 0 && sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${delta}px)`
      e.stopPropagation()
    }
  }

  const onTouchEnd = () => {
    if (touchDelta.current > 80) {
      onClose()
    } else if (sheetRef.current) {
      sheetRef.current.style.transition =
        'transform 300ms cubic-bezier(0.16, 1, 0.3, 1)'
      sheetRef.current.style.transform = 'translateY(0)'
      const el = sheetRef.current
      setTimeout(() => { if (el) el.style.transition = '' }, 300)
    }
  }

  const content = (
    <PanelContent
      sub={sub}
      fsaMedians={fsaMedians}
      viewerFsa={viewerFsa}
      prefersReduced={prefersReduced}
      onClose={onClose}
      onCtaClick={onCtaClick}
    />
  )

  if (isMobile) {
    return (
      <>
        {/* Mobile backdrop */}
        <motion.div
          className={styles.backdrop}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReduced ? 0 : 0.15, ease: [0.25, 0, 0.3, 1] as [number,number,number,number] }}
          onTouchEnd={onClose}
          onClick={onClose}
          style={{ zIndex: 199 }}
        />
        {/* Mobile bottom sheet */}
        <motion.div
          ref={sheetRef}
          className={styles.sheet}
          style={{
            zIndex:      200,
            borderLeft,
            paddingLeft,
          }}
          initial={prefersReduced ? false : { y: '100%' }}
          animate={{ y: 0 }}
          exit={prefersReduced
            ? { opacity: 0, transition: { duration: 0.15 } }
            : { y: '100%' }}
          transition={prefersReduced
            ? { duration: 0 }
            : { type: 'spring', stiffness: 240, damping: 24, mass: 1.0 }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className={styles.dragHandle} />
          {content}
        </motion.div>
      </>
    )
  }

  // Desktop panel
  return (
    <motion.div
      className={styles.panel}
      style={{
        position:        'fixed',
        left:            x,
        top:             y - 8,
        transform:       'translateX(-50%) translateY(-100%)',
        transformOrigin: 'bottom center',
        zIndex:          200,
        borderTop:       '1px solid #E2E1DD',
        borderRight:     '1px solid #E2E1DD',
        borderBottom:    '1px solid #E2E1DD',
        borderLeft,
        paddingLeft,
      }}
      initial={prefersReduced
        ? false
        : { opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={prefersReduced
        ? { opacity: 0, transition: { duration: 0.15 } }
        : { opacity: 0, scale: 0.97, y: 4 }}
      transition={prefersReduced
        ? { duration: 0 }
        : { type: 'spring', stiffness: 240, damping: 24, mass: 1.0 }}
    >
      {content}
    </motion.div>
  )
}

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
  filters:         FilterState
  onReady?:        (handle: MapViewHandle) => void
  onLeafletReady?: (map: L.Map) => void
  likeMeMode?:     boolean
  userProfile?:    UserProfile | null
  onCohortResult?: (result: CohortResult | null) => void
  onCtaClick?:     () => void
}

// ─── MapView ──────────────────────────────────────────────────────────────────

export default function MapView({
  filters, onReady, onLeafletReady,
  likeMeMode = false, userProfile = null,
  onCohortResult, onCtaClick,
}: MapViewProps) {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [isLoading,   setIsLoading]   = useState(true)
  const [viewerFsa,   setViewerFsa]   = useState<string | null>(null)
  const [isMobile,    setIsMobile]    = useState(false)

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
    hideTimerRef.current = setTimeout(() => setActiveTooltip(null), 150)
  }, [])

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

  // Click / tap on a marker — always locks the panel
  const onMarkerClick = useCallback((sub: Submission, x: number, y: number) => {
    cancelHideTimer()
    setActiveTooltip({ sub, x, y, mode: 'locked' })
  }, [cancelHideTimer])

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

  // Fetch once on mount
  useEffect(() => {
    const fetch = async () => {
      try {
        const { data, error } = await supabase
          .from('submissions')
          .select(
            'id, fsa, provider, insurance_type, rate_change_pct, sentiment, ' +
            'verified, created_at, comment_raw, years_licensed, at_fault_claims, ' +
            'convictions, home_claims',
          )
          .order('created_at', { ascending: false })
          .limit(500)

        if (error) console.error('Supabase fetch error:', error)
        if (data) setSubmissions(data as unknown as Submission[])
      } catch (err) {
        console.error('Unexpected error fetching submissions:', err)
      } finally {
        setIsLoading(false)
        isInitialLoad.current = false
      }
    }
    fetch()
  }, [])

  // FSA median map for context lines
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

  const allWithCentroid = useMemo(
    () => submissions.filter(s => getCentroid(s.fsa) !== null),
    [submissions],
  )

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
      <MapContainer
        center={[43.651, -79.383]}
        zoom={12}
        maxBounds={[[41.6, -95.2], [56.9, -74.3]]}
        maxBoundsViscosity={1.0}
        minZoom={6}
        maxZoom={16}
        zoomControl={false}
        style={{ position: 'fixed', inset: 0, zIndex: 0, width: '100vw', height: '100dvh', touchAction: 'none' }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          subdomains="abcd"
          maxZoom={19}
        />

        <AttributionFix />

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
          />
        )}
      </AnimatePresence>

      {/* Mode 2 — locked detail panel (desktop positioned + mobile sheet) */}
      <AnimatePresence>
        {at?.mode === 'locked' && (
          <LockedPanel
            key="locked-panel"
            sub={at.sub}
            x={at.x}
            y={at.y}
            fsaMedians={fsaMedians}
            viewerFsa={viewerFsa}
            prefersReduced={prefersReduced}
            isMobile={isMobile}
            onClose={dismissAll}
            onCtaClick={() => { dismissAll(); onCtaClick?.() }}
          />
        )}
      </AnimatePresence>
    </>
  )
}
