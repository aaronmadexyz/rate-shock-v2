'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence, useDragControls, useReducedMotion } from 'framer-motion'
import { springs } from '@/lib/springs'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export type { FilterState } from '@/lib/types'
import type { FilterState } from '@/lib/types'

interface FilterSheetProps {
  isOpen:     boolean
  onClose:    () => void
  onChange:   (filters: FilterState) => void
  matchCount: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PROVIDERS = [
  'Intact', 'Aviva', 'TD Insurance', 'Desjardins', 'Belairdirect',
  'CAA Insurance', 'Economical', 'Wawanesa', 'Travelers', 'Co-operators',
  'Gore Mutual', 'Sonnet', 'Allstate',
]

export const DEFAULT_FILTERS: FilterState = {
  insuranceType: null,
  provider:      null,
  rMin:          -30,
  rMax:          50,
}

export function countFilters(f: FilterState): number {
  let n = 0
  if (f.insuranceType !== null) n++
  if (f.provider !== null) n++
  if (f.rMin > -30 || f.rMax < 50) n++
  return n
}

// ─── Shared style ─────────────────────────────────────────────────────────────

const sectionLabel: React.CSSProperties = {
  fontFamily:    "'IBM Plex Mono', monospace",
  fontSize:      11,
  fontWeight:    500,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color:         'var(--n-400)',
  display:       'block',
  marginBottom:  8,
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AutoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1" y="5" width="14" height="8" rx="2" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="4.5" cy="13" r="1.5" fill="currentColor"/>
      <circle cx="11.5" cy="13" r="1.5" fill="currentColor"/>
      <path d="M4 5l1.5-3h5L12 5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    </svg>
  )
}

function HomeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 7l6-5 6 5v7a1 1 0 01-1 1H3a1 1 0 01-1-1V7z" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M6 14V9h4v5" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  )
}

// ─── DualRange ────────────────────────────────────────────────────────────────

interface DualRangeProps {
  valueMin:    number
  valueMax:    number
  onMinChange: (v: number) => void
  onMaxChange: (v: number) => void
}

const RANGE_MIN = -30
const RANGE_MAX = 50
const RANGE_SPAN = RANGE_MAX - RANGE_MIN // 80
const MIN_GAP = 1

function DualRange({ valueMin, valueMax, onMinChange, onMaxChange }: DualRangeProps) {
  const fillLeft  = ((valueMin - RANGE_MIN) / RANGE_SPAN) * 100
  const fillRight = 100 - ((valueMax - RANGE_MIN) / RANGE_SPAN) * 100

  return (
    <div style={{ position: 'relative', width: '100%', height: 4, marginTop: 6 }}>
      {/* Track background */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: 4, borderRadius: 2, background: 'var(--n-200)',
      }} />
      {/* Track fill */}
      <div style={{
        position: 'absolute', top: 0,
        left: fillLeft + '%', right: fillRight + '%',
        height: 4, borderRadius: 2, background: 'var(--n-900)',
        transition: 'left .05s, right .05s',
      }} />
      {/* Min handle */}
      <input
        type="range"
        className="fs-rh"
        min={RANGE_MIN} max={RANGE_MAX} step={1}
        value={valueMin}
        aria-label="Minimum rate"
        aria-valuenow={valueMin}
        aria-valuemin={RANGE_MIN}
        aria-valuemax={valueMax - MIN_GAP}
        aria-valuetext={`${valueMin} percent`}
        onChange={e => {
          const newMin = parseInt(e.target.value)
          const clamped = Math.min(newMin, valueMax - MIN_GAP)
          e.target.value = String(clamped)
          onMinChange(clamped)
        }}
      />
      {/* Max handle */}
      <input
        type="range"
        className="fs-rh"
        min={RANGE_MIN} max={RANGE_MAX} step={1}
        value={valueMax}
        aria-label="Maximum rate"
        aria-valuenow={valueMax}
        aria-valuemin={valueMin + MIN_GAP}
        aria-valuemax={RANGE_MAX}
        aria-valuetext={valueMax >= 50 ? '50 percent or more' : `${valueMax} percent`}
        onChange={e => {
          const newMax = parseInt(e.target.value)
          const clamped = Math.max(newMax, valueMin + MIN_GAP)
          e.target.value = String(clamped)
          onMaxChange(clamped)
        }}
      />
    </div>
  )
}

// ─── Thumb + track CSS ────────────────────────────────────────────────────────

const FILTER_CSS = `
  /* ── Dual-range slider ─────────────────────────────────────── */
  .fs-rh {
    position: absolute;
    width: 100%;
    top: -8px;
    height: 20px;
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    pointer-events: none;
    margin: 0; padding: 0;
  }
  .fs-rh::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px; height: 20px; border-radius: 50%;
    background: var(--n-0);
    border: 1.5px solid var(--n-200);
    box-shadow: 0 1px 3px rgba(0,0,0,.12);
    cursor: pointer;
    pointer-events: all;
    transition: border-color .15s, transform .1s;
  }
  .fs-rh::-webkit-slider-thumb:hover { border-color: var(--n-400); }
  .fs-rh:active::-webkit-slider-thumb { transform: scale(1.18); }
  .fs-rh::-moz-range-thumb {
    width: 20px; height: 20px; border-radius: 50%;
    background: var(--n-0);
    border: 1.5px solid var(--n-200);
    box-shadow: 0 1px 3px rgba(0,0,0,.12);
    cursor: pointer;
    pointer-events: all;
    transition: border-color .15s, transform .1s;
  }
  .fs-rh:focus-visible { outline: none; }
  .fs-rh:focus-visible::-webkit-slider-thumb {
    border-color: var(--p-400);
    box-shadow: 0 0 0 3px rgba(99,106,197,.12);
  }

  /* ── Insurance type buttons — Rule 1 press feedback ────────── */
  .fs-type-btn:active { transform: scale(0.97); }

  /* ── Provider pills — Rule 1 press feedback ─────────────────── */
  .fs-pill:active { transform: scale(0.97); }

  /* ── Close button — 44px tap target + Rule 1 ────────────────── */
  .fs-close { position: relative; }
  .fs-close::before {
    content: '';
    position: absolute;
    inset: -9px;
    border-radius: 50%;
  }
  .fs-close:active { transform: scale(0.97); }
`

// ─── Section divider ──────────────────────────────────────────────────────────

const Divider = () => (
  <div style={{ height: 1, background: 'var(--n-100)', margin: '20px -20px' }} />
)

// ─── Main component ───────────────────────────────────────────────────────────

export default function FilterSheet({ isOpen, onClose, onChange, matchCount }: FilterSheetProps) {
  const [filters,       setFilters]       = useState<FilterState>(DEFAULT_FILTERS)
  const [isMobile,      setIsMobile]      = useState(false)
  const [dist,          setDist]          = useState<number[]>([])
  const [providerCounts, setProviderCounts] = useState<Record<string, number>>({})
  const statsFetched    = useRef(false)
  const dragControls    = useDragControls()
  const prefersReduced  = useReducedMotion()
  const cardRef         = useRef<HTMLDivElement>(null)
  const triggerRef      = useRef<HTMLElement | null>(null)
  const hasOpenedBefore = useRef(false)

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 680)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Fetch distribution + provider counts once on first open
  useEffect(() => {
    if (!isOpen || statsFetched.current) return
    statsFetched.current = true
    ;(async () => {
      const { data } = await supabase
        .from('submissions')
        .select('rate_change_pct, provider')
        .limit(500)
      if (!data?.length) return

      const buckets  = new Array(81).fill(0) // indices 0–80 → -30% to +50%
      const counts: Record<string, number> = {}

      for (const row of data) {
        if (row.rate_change_pct != null) {
          const v   = Math.max(-30, Math.min(50, Math.round(row.rate_change_pct as number)))
          buckets[v + 30]++
        }
        if (row.provider) {
          counts[row.provider] = (counts[row.provider] ?? 0) + 1
        }
      }
      setDist(buckets)
      setProviderCounts(counts)
    })()
  }, [isOpen])

  // Sort providers: higher count first, then alphabetical
  const sortedProviders = useMemo(() =>
    [...PROVIDERS].sort((a, b) => {
      const ca = providerCounts[a] ?? 0
      const cb = providerCounts[b] ?? 0
      if (ca !== cb) return cb - ca
      return a.localeCompare(b)
    }),
    [providerCounts]
  )

  // Focus management
  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement
      setTimeout(() => {
        cardRef.current?.querySelector<HTMLElement>(
          'button:not([disabled]), input:not([disabled])'
        )?.focus()
      }, 50)
    } else {
      triggerRef.current?.focus()
    }
  }, [isOpen])

  // Click-outside to close (desktop only)
  useEffect(() => {
    if (!isOpen || isMobile) return
    const handleClickOutside = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 100)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, isMobile, onClose])

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  // Tab focus trap (desktop)
  useEffect(() => {
    if (!isOpen || isMobile) return
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const card = cardRef.current
      if (!card) return
      const focusable = Array.from(
        card.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last  = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', handleTab)
    return () => document.removeEventListener('keydown', handleTab)
  }, [isOpen, isMobile])

  // Re-enable pinch-zoom on mobile while sheet is open
  useEffect(() => {
    if (!isMobile) return
    const VP_MAP   = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'
    const VP_MODAL = 'width=device-width, initial-scale=1, viewport-fit=cover'
    const vp = document.querySelector('meta[name=viewport]')
    vp?.setAttribute('content', isOpen ? VP_MODAL : VP_MAP)
    return () => { vp?.setAttribute('content', VP_MAP) }
  }, [isOpen, isMobile])

  // ── Filter mutators ──────────────────────────────────────────────────────────

  const update = useCallback((next: FilterState) => {
    setFilters(next)
    onChange(next)
  }, [onChange])

  const clearAll = () => update(DEFAULT_FILTERS)
  const setRMin  = (v: number) => update({ ...filters, rMin: v })
  const setRMax  = (v: number) => update({ ...filters, rMax: v })

  const hasActiveFilters =
    filters.insuranceType !== null ||
    filters.provider !== null ||
    filters.rMin > -30 ||
    filters.rMax < 50

  // ── Desktop animation ────────────────────────────────────────────────────────

  const isFirstOpen = !hasOpenedBefore.current
  const desktopEntryTransition = prefersReduced
    ? { duration: 0 }
    : isFirstOpen
      ? { type: 'spring' as const, ...springs.responsive }
      : { duration: 0 }

  // ── Filter body ──────────────────────────────────────────────────────────────

  const filterBody = (
    <>
      {/* ─ Insurance type ─────────────────────────────────────────────────── */}
      <span style={{
        ...sectionLabel,
        color: filters.insuranceType === null ? 'var(--n-400)' : 'var(--n-400)',
      }}>
        {filters.insuranceType === null
          ? 'TYPE'
          : filters.insuranceType === 'auto'
          ? 'TYPE · Auto only'
          : 'TYPE · Home only'}
      </span>
      <div
        role="group"
        aria-label="Insurance type filter"
        style={{ display: 'flex', gap: 8 }}
      >
        {(['auto', 'home'] as const).map(t => {
          const isSelected    = filters.insuranceType === t
          const isOtherActive = filters.insuranceType !== null && filters.insuranceType !== t
          return (
            <button
              key={t}
              type="button"
              className="fs-type-btn"
              onClick={() => update({ ...filters, insuranceType: isSelected ? null : t })}
              style={{
                flex:           1,
                fontFamily:     'inherit',
                fontSize:       13,
                fontWeight:     500,
                padding:        '10px 8px',
                borderRadius:   'var(--r-md)',
                border:         `1.5px solid ${isSelected ? 'var(--n-900)' : 'var(--n-150)'}`,
                background:     isSelected ? 'var(--n-900)' : isOtherActive ? 'var(--n-0)' : 'var(--n-100)',
                color:          isSelected ? 'var(--n-0)' : isOtherActive ? 'var(--n-400)' : 'var(--n-700)',
                opacity:        isOtherActive ? 0.6 : 1,
                cursor:         'pointer',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                gap:            6,
                transition:     'all .18s cubic-bezier(.16,1,.3,1)',
                letterSpacing:  '-0.01em',
              }}
            >
              {t === 'auto' ? <AutoIcon /> : <HomeIcon />}
              {t === 'auto' ? 'Auto' : 'Home'}
            </button>
          )
        })}
      </div>

      <Divider />

      {/* ─ Provider pills ─────────────────────────────────────────────────── */}
      <span style={sectionLabel}>Provider</span>
      <div
        role="group"
        aria-label="Provider filter"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
      >
        {sortedProviders.map(name => {
          const on    = filters.provider === name
          const count = providerCounts[name] ?? 0
          return (
            <button
              key={name}
              type="button"
              className="fs-pill"
              role="checkbox"
              aria-checked={on}
              onClick={() => update({ ...filters, provider: on ? null : name })}
              style={{
                fontFamily:    'inherit',
                fontSize:      12,
                fontWeight:    500,
                padding:       '8px 12px',
                borderRadius:  9999,
                border:        `1px solid ${on ? 'var(--n-900)' : 'var(--n-400)'}`,
                background:    on ? 'var(--n-900)' : 'var(--n-0)',
                color:         on ? 'var(--n-0)' : 'var(--n-600)',
                cursor:        'pointer',
                transition:    'all .18s cubic-bezier(.16,1,.3,1)',
                letterSpacing: '-0.01em',
                whiteSpace:    'nowrap',
                lineHeight:    1,
                display:       'inline-flex',
                alignItems:    'center',
                gap:           4,
                opacity:       count === 0 ? 0.45 : 1,
              }}
            >
              {name}
              {count > 0 && (
                <span style={{
                  fontFamily:    "'IBM Plex Mono', monospace",
                  fontSize:      11,
                  fontWeight:    500,
                  color:         on ? 'var(--n-200)' : 'var(--n-400)', /* n-200 on n-900 bg ≈ 6.7:1 ✓; n-400 on n-0 bg = 4.57:1 ✓ */
                  letterSpacing: '0.02em',
                }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <Divider />

      {/* ─ Rate range ──────────────────────────────────────────────────────── */}
      <span style={sectionLabel}>Rate</span>
      <div role="group" aria-label="Rate change range" style={{ position: 'relative', paddingBottom: 4 }}>
        {/* Endpoint display — compact 14px */}
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: 8,
        }}>
          <span style={{
            fontFamily:         "'IBM Plex Mono', monospace",
            fontSize:           14, fontWeight: 600,
            color:              'var(--n-900)',
            letterSpacing:      '-0.02em',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {filters.rMin < 0 ? `−${Math.abs(filters.rMin)}%` : `${filters.rMin}%`}
          </span>
          <span style={{ fontSize: 11, color: 'var(--n-400)', fontFamily: "'IBM Plex Mono', monospace" }}>to</span>
          <span style={{
            fontFamily:         "'IBM Plex Mono', monospace",
            fontSize:           14, fontWeight: 600,
            color:              'var(--n-900)',
            letterSpacing:      '-0.02em',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {filters.rMax >= 50 ? '50%+' : `${filters.rMax}%`}
          </span>
        </div>

        {/* Distribution bars — hidden while loading / no data */}
        {dist.some(v => v > 0) && (() => {
          const distMax = Math.max(...dist, 1)
          return (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 0, height: 20, marginBottom: 4 }}>
              {dist.map((v, i) => {
                const pct     = i - 30 // -30 to +50
                const inRange = pct >= filters.rMin && pct <= filters.rMax
                return (
                  <div
                    key={i}
                    style={{
                      flex:         1,
                      borderRadius: '2px 2px 0 0',
                      background:   inRange ? 'var(--n-500)' : 'var(--n-150)',
                      height:       `${Math.max(2, Math.round(v / distMax * 20))}px`,
                      transition:   'background .2s',
                    }}
                  />
                )
              })}
            </div>
          )
        })()}

        <DualRange
          valueMin={filters.rMin} valueMax={filters.rMax}
          onMinChange={setRMin}   onMaxChange={setRMax}
        />

        {/* Boundary labels — range markers, deliberately quiet */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'var(--n-400)' }}>
            {filters.rMin < 0 ? `−${Math.abs(filters.rMin)}%` : `${filters.rMin}%`}
          </span>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'var(--n-400)' }}>
            {filters.rMax >= 50 ? '50%+' : `${filters.rMax}%`}
          </span>
        </div>
      </div>
    </>
  )

  // ── Headers (shared between desktop and mobile) ───────────────────────────

  const header = (padding: string) => (
    <div style={{
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'space-between',
      padding,
      borderBottom:   '1px solid var(--n-100)',
      flexShrink:     0,
    }}>
      {/* Left: title + live count */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <h2
          id="filter-title"
          style={{
            fontSize:      15,
            fontWeight:    500,
            color:         'var(--n-900)',
            letterSpacing: '-0.01em',
            margin:        0,
          }}
        >
          Filter
        </h2>
        <span style={{
          fontFamily:    "'IBM Plex Mono', monospace",
          fontSize:      11,
          fontWeight:    500,
          color:         matchCount === 0 ? 'var(--neg-500)' : 'var(--n-400)',
          letterSpacing: '0.02em',
        }}>
          {matchCount === 0 ? 'No results' : `${matchCount} marker${matchCount === 1 ? '' : 's'}`}
        </span>
      </div>

      {/* Right: Clear all + Close */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearAll}
            style={{
              fontFamily:    'inherit',
              fontSize:      13,
              fontWeight:    500,
              color:         'var(--p-600)',
              background:    'none',
              border:        'none',
              cursor:        'pointer',
              padding:       '4px 0',
              letterSpacing: '-0.01em',
            }}
          >
            Clear all
          </button>
        )}
        <button
          type="button"
          className="fs-close"
          onClick={onClose}
          aria-label="Close filter"
          style={{
            width:          26,
            height:         26,
            borderRadius:   '50%',
            border:         '1px solid var(--n-150)',
            background:     'var(--n-0)',
            cursor:         'pointer',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            flexShrink:     0,
            transition:     'background .15s',
            padding:        0,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--n-50)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--n-0)')}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="var(--n-400)" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{FILTER_CSS}</style>

      {/* ── Desktop floating card ─────────────────────────────────────────── */}
      <AnimatePresence>
        {isOpen && !isMobile && (
          <motion.div
            ref={cardRef}
            id="filter-panel"
            role="region"
            aria-label="Map filters"
            style={{
              position:        'absolute',
              bottom:          'calc(100% + 8px)',
              left:            0,
              width:           280,
              background:      'var(--n-0)',
              border:          '1px solid var(--n-150)',
              borderRadius:    'var(--r-lg)',
              boxShadow:       'var(--sh-lg)',
              overflow:        'hidden',
              zIndex:          450, // z-overlay
              willChange:      'transform, opacity',
              transformOrigin: 'bottom left',
            }}
            initial={{ opacity: 0, scale: 0.95, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{
              opacity: 0, scale: 0.97, y: 4,
              transition: { duration: 0.15, ease: [0.4, 0, 1, 1] as [number,number,number,number] },
            }}
            transition={desktopEntryTransition}
            onAnimationComplete={(definition) => {
              if (definition === 'animate') {
                hasOpenedBefore.current = true
                if (cardRef.current) cardRef.current.style.willChange = 'auto'
              }
            }}
          >
            {header('14px 16px 12px')}
            <div style={{ padding: '16px 20px 28px', overflowY: 'auto', maxHeight: 480 }}>
              {filterBody}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Mobile bottom sheet ───────────────────────────────────────────── */}
      <AnimatePresence>
        {isOpen && isMobile && (
          <>
            {/* Backdrop */}
            <motion.div
              key="mobile-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onClick={onClose}
              style={{
                position:   'fixed',
                inset:      0,
                zIndex:     400, // z-overlay-bg
                background: 'rgba(26,25,23,0.28)',
              }}
            />

            {/* Sheet */}
            <motion.div
              key="mobile-sheet"
              ref={cardRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="filter-title"
              id="filter-panel"
              drag="y"
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0 }}
              dragElastic={0.15}
              onDragEnd={(_, info) => { if (info.offset.y > 80) onClose() }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
              style={{
                position:      'fixed',
                bottom:        0, left: 0, right: 0,
                zIndex:        450, // z-overlay
                background:    'var(--n-0)',
                borderRadius:  'var(--r-xl) var(--r-xl) 0 0',
                boxShadow:     '0 -4px 32px rgba(26,25,23,.1), 0 -1px 4px rgba(26,25,23,.05)',
                maxHeight:     '72vh',
                display:       'flex',
                flexDirection: 'column',
                touchAction:   'none',
              }}
            >
              {/* Drag handle */}
              <div
                onPointerDown={e => dragControls.start(e)}
                style={{
                  display:     'flex',
                  justifyContent: 'center',
                  padding:     '12px 0 4px',
                  cursor:      'grab',
                  touchAction: 'none',
                  flexShrink:  0,
                }}
              >
                <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--n-300)' }} />
              </div>

              {header('14px 20px 12px')}

              {/* Scrollable body */}
              <div style={{
                overflowY:               'auto',
                padding:                 '16px 20px 28px',
                flex:                    1,
                touchAction:             'pan-y',
                overscrollBehavior:      'contain',
                WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
              }}>
                {filterBody}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
