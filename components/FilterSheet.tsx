'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence, useDragControls, useReducedMotion } from 'framer-motion'
import { springs } from '@/lib/springs'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export type { FilterState } from '@/lib/types'
import type { FilterState } from '@/lib/types'

interface FilterSheetProps {
  isOpen: boolean
  onClose: () => void
  onChange: (filters: FilterState) => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PROVIDERS = [
  'Intact', 'Aviva', 'TD Insurance', 'Desjardins', 'Belairdirect',
  'CAA Insurance', 'Economical', 'Wawanesa', 'Travelers', 'Co-operators',
  'Gore Mutual', 'Sonnet', 'Allstate',
]

const DEFAULT_FILTERS: FilterState = {
  types: { auto: true, home: true },
  provs: [],
  rMin: 0,
  rMax: 50,
  verified: false,
}

export function countFilters(f: FilterState): number {
  let n = 0
  if (!f.types.auto || !f.types.home) n++
  n += f.provs.length
  if (f.rMin > 0 || f.rMax < 50) n++
  if (f.verified) n++
  return n
}

// ─── Shared style ─────────────────────────────────────────────────────────────

const sectionLabel: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--n-400)',
  display: 'block',
  margin: '14px 0 8px',
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

interface DualRangeProps {
  valueMin: number
  valueMax: number
  onMinChange: (v: number) => void
  onMaxChange: (v: number) => void
}

const MIN_GAP = 1

function DualRange({ valueMin, valueMax, onMinChange, onMaxChange }: DualRangeProps) {
  const fillLeft  = (valueMin / 50) * 100
  const fillRight = 100 - (valueMax / 50) * 100

  return (
    <div style={{ position: 'relative', width: '100%', height: 4, marginTop: 4 }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: 4, borderRadius: 2, background: '#E2E1DD',
      }} />
      <div style={{
        position: 'absolute', top: 0,
        left: fillLeft + '%', right: fillRight + '%',
        height: 4, borderRadius: 2, background: '#1A1917',
        transition: 'left .05s, right .05s',
      }} />
      <input
        type="range"
        className="fs-rh"
        min={0} max={50} step={1}
        value={valueMin}
        aria-label="Minimum rate increase"
        aria-valuenow={valueMin}
        aria-valuemin={0}
        aria-valuemax={valueMax - MIN_GAP}
        aria-valuetext={`${valueMin} percent`}
        onChange={e => {
          const newMin = parseInt(e.target.value)
          const clamped = Math.min(newMin, valueMax - MIN_GAP)
          e.target.value = String(clamped)
          onMinChange(clamped)
        }}
      />
      <input
        type="range"
        className="fs-rh"
        min={0} max={50} step={1}
        value={valueMax}
        aria-label="Maximum rate increase"
        aria-valuenow={valueMax}
        aria-valuemin={valueMin + MIN_GAP}
        aria-valuemax={50}
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

// ─── Range input thumb styles ─────────────────────────────────────────────────

const RANGE_THUMB_CSS = `
  .fs-rh {
    position: absolute;
    width: 100%;
    top: -7px;
    height: 18px;
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    pointer-events: none;
    margin: 0; padding: 0;
  }
  .fs-rh::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 18px; height: 18px; border-radius: 50%;
    background: #FFFFFF;
    border: 1.5px solid #B8B7B1;
    box-shadow: 0 1px 3px rgba(26,25,23,.12);
    cursor: pointer;
    pointer-events: all;
    transition: border-color .15s, transform .1s;
  }
  .fs-rh::-webkit-slider-thumb:hover { border-color: #5E5D56; }
  .fs-rh:active::-webkit-slider-thumb { transform: scale(1.18); }
  .fs-rh::-moz-range-thumb {
    width: 18px; height: 18px; border-radius: 50%;
    background: #FFFFFF;
    border: 1.5px solid #B8B7B1;
    box-shadow: 0 1px 3px rgba(26,25,23,.12);
    cursor: pointer;
    pointer-events: all;
  }
`

// ─── Main component ───────────────────────────────────────────────────────────

export default function FilterSheet({ isOpen, onClose, onChange }: FilterSheetProps) {
  const [filters, setFilters]   = useState<FilterState>(DEFAULT_FILTERS)
  const [isMobile, setIsMobile] = useState(false)
  const [dist, setDist]         = useState<number[]>([])
  const distFetched             = useRef(false)
  const dragControls            = useDragControls()
  const prefersReduced          = useReducedMotion()
  const cardRef                 = useRef<HTMLDivElement>(null)
  const triggerRef              = useRef<HTMLElement | null>(null)
  const hasOpenedBefore         = useRef(false)

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 680)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Fetch rate distribution on first open
  useEffect(() => {
    if (!isOpen || distFetched.current) return
    distFetched.current = true
    ;(async () => {
      const { data, error } = await supabase
        .from('submissions')
        .select('rate_change_pct')
        .not('rate_change_pct', 'is', null)
      if (error || !data) return
      const buckets = Array<number>(50).fill(0)
      for (const row of data) {
        const slot = Math.min(49, Math.max(0, Math.floor(row.rate_change_pct as number)))
        buckets[slot]++
      }
      setDist(buckets)
    })()
  }, [isOpen])

  // Focus management: capture trigger on open, return focus on close
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

  // Escape key (both modes)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  // Tab focus trap (desktop only)
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
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
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

  const toggleType = (t: 'auto' | 'home') => {
    const types = { ...filters.types }
    const both = types.auto && types.home
    if (both) {
      types[t === 'auto' ? 'home' : 'auto'] = false
    } else {
      types[t] = !types[t]
      if (!types.auto && !types.home) types[t] = true
    }
    update({ ...filters, types })
  }

  const toggleProv = (name: string) => {
    const provs = filters.provs.includes(name)
      ? filters.provs.filter(p => p !== name)
      : [...filters.provs, name]
    update({ ...filters, provs })
  }

  const setRMin = (v: number) => update({ ...filters, rMin: v })
  const setRMax = (v: number) => update({ ...filters, rMax: v })
  const toggleVerified = () => update({ ...filters, verified: !filters.verified })

  const hasFilters = countFilters(filters) > 0

  // ── Desktop animation (Rule 3: instant on subsequent opens) ─────────────────

  const isFirstOpen = !hasOpenedBefore.current
  const desktopEntryTransition = prefersReduced
    ? { duration: 0 }
    : isFirstOpen
      ? { type: 'spring' as const, ...springs.responsive }
      : { duration: 0 }

  // ── Shared filter body ───────────────────────────────────────────────────────

  const filterBody = (
    <>
      {/* Insurance type */}
      <div style={{ display: 'flex', gap: 8 }}>
        {(['auto', 'home'] as const).map(t => {
          const on = filters.types[t]
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggleType(t)}
              style={{
                flex: 1, fontFamily: 'inherit',
                fontSize: 13, fontWeight: 500,
                padding: '10px 8px', borderRadius: 10,
                border: `1.5px solid ${on ? '#1A1917' : '#D4D3CE'}`,
                background: on ? '#1A1917' : '#FFFFFF',
                color: on ? '#FFFFFF' : '#5E5D56',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'all .18s cubic-bezier(.16,1,.3,1)',
                letterSpacing: '-0.01em',
              }}
            >
              {t === 'auto' ? <AutoIcon /> : <HomeIcon />}
              {t === 'auto' ? 'Auto' : 'Home'}
            </button>
          )
        })}
      </div>
      <div style={{ height: 1, background: '#EEEDEA', marginTop: 16 }} />

      {/* Provider pills */}
      <span style={sectionLabel}>Provider</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {PROVIDERS.map(name => {
          const on = filters.provs.includes(name)
          return (
            <button
              key={name}
              type="button"
              onClick={() => toggleProv(name)}
              style={{
                fontFamily: 'inherit',
                fontSize: 12, fontWeight: 500,
                padding: '6px 13px', borderRadius: 9999,
                border: `1px solid ${on ? '#1A1917' : '#D4D3CE'}`,
                background: on ? '#1A1917' : '#FFFFFF',
                color: on ? '#FFFFFF' : '#5E5D56',
                cursor: 'pointer',
                transition: 'all .18s cubic-bezier(.16,1,.3,1)',
                letterSpacing: '-0.01em',
                whiteSpace: 'nowrap', lineHeight: 1,
              }}
            >
              {name}
            </button>
          )
        })}
      </div>

      {/* Rate increase range */}
      <span style={sectionLabel}>Rate increase</span>
      <div role="group" aria-label="Rate increase range filter" style={{ position: 'relative', paddingBottom: 4 }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: 10,
        }}>
          <span style={{
            fontSize: 22, fontWeight: 600, color: '#1A1917',
            letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums',
          }}>
            {filters.rMin}%
          </span>
          <span style={{ fontSize: 13, color: 'var(--n-400)' }}>to</span>
          <span style={{
            fontSize: 22, fontWeight: 600, color: '#1A1917',
            letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums',
          }}>
            {filters.rMax >= 50 ? '50%+' : `${filters.rMax}%`}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 20, marginBottom: 4 }}>
          {(() => {
            const bars = dist.length > 0 ? dist : Array<number>(50).fill(0)
            const distMax = Math.max(...bars, 1)
            return bars.map((v, i) => (
              <div
                key={i}
                style={{
                  flex: 1, borderRadius: '2px 2px 0 0',
                  background: i >= filters.rMin && i <= filters.rMax ? '#B0B4E6' : '#EEEDEA',
                  height: `${Math.max(3, Math.round(v / distMax * 20))}px`,
                  transition: 'background .2s',
                }}
              />
            ))
          })()}
        </div>
        <DualRange
          valueMin={filters.rMin} valueMax={filters.rMax}
          onMinChange={setRMin} onMaxChange={setRMax}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          {['0%', '10%', '20%', '30%', '40%', '50%+'].map(l => (
            <span key={l} style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'var(--n-400)' }}>
              {l}
            </span>
          ))}
        </div>
      </div>

      {/* Verified only */}
      <span style={{ ...sectionLabel, color: '#B8B7B1' }}>Trust</span>
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '10px 0',
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#5E5D56', letterSpacing: '-0.01em' }}>
            Verified posts only
          </div>
          <div style={{ fontSize: 11, color: 'var(--n-400)', marginTop: 2, lineHeight: 1.4 }}>
            Show only posts backed by a renewal letter
          </div>
        </div>
        <button
          type="button"
          onClick={toggleVerified}
          aria-pressed={filters.verified}
          style={{
            width: 42, height: 24, borderRadius: 9999,
            background: filters.verified ? '#1A1917' : '#D4D3CE',
            border: 'none', cursor: 'pointer',
            position: 'relative', flexShrink: 0, marginLeft: 16,
            transition: 'background .2s cubic-bezier(.16,1,.3,1)',
          }}
        >
          <span style={{
            position: 'absolute', width: 18, height: 18, borderRadius: '50%',
            background: '#FFFFFF', top: 3,
            left: filters.verified ? 21 : 3,
            boxShadow: '0 1px 3px rgba(26,25,23,.14)',
            transition: 'left .22s cubic-bezier(.16,1,.3,1)',
            display: 'block',
          }} />
        </button>
      </div>
    </>
  )

  // ── Shared close button ──────────────────────────────────────────────────────

  const closeBtn = (size: number) => (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close filter"
      style={{
        width: size, height: size, borderRadius: '50%',
        border: '1px solid var(--n-150)',
        background: 'var(--n-0)',
        cursor: 'pointer', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, transition: 'background .15s', padding: 0,
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--n-50)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'var(--n-0)')}
    >
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
        <path d="M1 1l6 6M7 1l-6 6" stroke="var(--n-400)" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    </button>
  )

  const clearAllBtn = (fontSize: number) => (
    <button
      type="button"
      onClick={hasFilters ? clearAll : undefined}
      style={{
        fontFamily: 'inherit', fontSize, fontWeight: 500,
        color: hasFilters ? 'var(--p-600)' : 'var(--n-300)',
        background: 'none', border: 'none',
        cursor: hasFilters ? 'pointer' : 'default',
        padding: 4, letterSpacing: '-0.01em',
        pointerEvents: hasFilters ? 'all' : 'none',
        transition: 'color .15s',
      }}
    >
      Clear all
    </button>
  )

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{RANGE_THUMB_CSS}</style>

      {/* ── Desktop floating card (position: absolute relative to filterWrapper) ── */}
      <AnimatePresence>
        {isOpen && !isMobile && (
          <motion.div
            ref={cardRef}
            id="filter-panel"
            role="region"
            aria-label="Map filters"
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 8px)',
              left: 0,
              width: 280,
              background: 'var(--n-0)',
              border: '1px solid var(--n-150)',
              borderRadius: 14,
              boxShadow: '0 8px 28px rgba(26,25,23,.08), 0 2px 6px rgba(26,25,23,.04)',
              overflow: 'hidden',
              zIndex: 450, // z-overlay
              willChange: 'transform, opacity',
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
            {/* Card header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px 10px',
              borderBottom: '1px solid var(--n-100)',
              flexShrink: 0,
            }}>
              <span style={{
                fontSize: 13, fontWeight: 500,
                color: 'var(--n-900)', letterSpacing: '-0.01em',
              }}>
                Filter
              </span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {clearAllBtn(12)}
                {closeBtn(22)}
              </div>
            </div>

            {/* Card body */}
            <div style={{ padding: '12px 16px 16px', overflowY: 'auto', maxHeight: 480 }}>
              {filterBody}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Mobile bottom sheet (position: fixed, covers full viewport) ─────── */}
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
                position: 'fixed', inset: 0,
                zIndex: 400, // z-backdrop
                background: 'rgba(26,25,23,0.28)',
              }}
            />

            {/* Sheet */}
            <motion.div
              key="mobile-sheet"
              ref={cardRef}
              role="dialog"
              aria-modal="true"
              aria-label="Filter map"
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
                position: 'fixed',
                bottom: 0, left: 0, right: 0,
                zIndex: 450, // z-overlay
                background: '#FFFFFF',
                borderRadius: '20px 20px 0 0',
                boxShadow: '0 -4px 32px rgba(26,25,23,.1), 0 -1px 4px rgba(26,25,23,.05)',
                maxHeight: '72vh',
                display: 'flex',
                flexDirection: 'column',
                touchAction: 'none',
              }}
            >
              {/* Drag handle */}
              <div
                onPointerDown={e => dragControls.start(e)}
                style={{
                  display: 'flex', justifyContent: 'center',
                  padding: '12px 0 4px', cursor: 'grab',
                  touchAction: 'none', flexShrink: 0,
                }}
              >
                <div style={{ width: 36, height: 4, borderRadius: 2, background: '#D4D3CE' }} />
              </div>

              {/* Header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 20px 12px', flexShrink: 0,
                borderBottom: '1px solid #EEEDEA',
              }}>
                <span style={{
                  fontSize: 15, fontWeight: 500, color: '#1A1917',
                  letterSpacing: '-0.01em',
                }}>
                  Filter
                </span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {clearAllBtn(13)}
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close filter"
                    style={{
                      width: 26, height: 26, borderRadius: '50%',
                      border: '1px solid #EEEDEA', background: '#FFFFFF',
                      cursor: 'pointer', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, transition: 'background .15s', padding: 0,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#F5F4F1')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#FFFFFF')}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                      <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="#767670" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Scrollable body */}
              <div style={{
                overflowY: 'auto', padding: '16px 20px 32px',
                flex: 1, touchAction: 'pan-y',
                overscrollBehavior: 'contain',
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
