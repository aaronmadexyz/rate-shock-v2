'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence, useDragControls } from 'framer-motion'
import { useReducedMotion } from '@/lib/motionSafety'

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

const DIST = [
  2,3,5,7,11,16,20,18,14,10,7,5,4,3,2,2,2,1,1,1,1,1,1,1,1,1,1,1,1,1,
  1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
]
const DIST_MAX = Math.max(...DIST)

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

// ─── Entrance / exit variants ─────────────────────────────────────────────────

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.04,
      delayChildren:   0.05,
    },
  },
  exit: {
    transition: {
      staggerChildren: 0, // no stagger on exit — all children fade together
    },
  },
}

const itemVariants = {
  hidden:   { opacity: 0, y: 8 },
  visible:  {
    opacity:    1,
    y:          0,
    transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    opacity:    0,
    transition: { duration: 0.12, ease: [0.4, 0, 1, 1] },
  },
}

// ─── Shared style ─────────────────────────────────────────────────────────────

const sectionLabel: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#9A998F',
  display: 'block',
  margin: '18px 0 10px',
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
      {/* Track */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: 4, borderRadius: 2, background: '#E2E1DD',
      }} />
      {/* Active fill */}
      <div style={{
        position: 'absolute', top: 0,
        left: fillLeft + '%', right: fillRight + '%',
        height: 4, borderRadius: 2, background: '#1A1917',
        transition: 'left .05s, right .05s',
      }} />
      {/* Min handle */}
      <input
        type="range"
        className="fs-rh"
        min={0} max={50} step={1}
        value={valueMin}
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
        min={0} max={50} step={1}
        value={valueMax}
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function FilterSheet({ isOpen, onClose, onChange }: FilterSheetProps) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const dragControls = useDragControls()
  const { prefersReduced } = useReducedMotion()
  const sheetRef  = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  // Focus management: store trigger, move focus in, return focus on close
  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement
      setTimeout(() => {
        const first = sheetRef.current?.querySelector<HTMLElement>(
          'button:not([disabled]), input'
        )
        first?.focus()
      }, 50)
    } else {
      triggerRef.current?.focus()
    }
  }, [isOpen])

  // Escape key handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  const update = useCallback((next: FilterState) => {
    setFilters(next)
    onChange(next)
  }, [onChange])

  // ── Filter mutators ──────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Range input thumb styles — can't target ::webkit-slider-thumb inline */}
      <style>{`
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
      `}</style>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* ── Backdrop ── */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onClick={onClose}
              style={{
                position: 'fixed', inset: 0,
                zIndex: 149,
                background: 'rgba(26,25,23,0.28)',
              }}
            />

            {/* ── Sheet ── */}
            <motion.div
              ref={sheetRef}
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
                zIndex: 150,
                background: '#FFFFFF',
                borderRadius: '20px 20px 0 0',
                boxShadow: '0 -4px 32px rgba(26,25,23,.1), 0 -1px 4px rgba(26,25,23,.05)',
                maxHeight: '72vh',
                display: 'flex',
                flexDirection: 'column',
              }}
            >

              {/* ── Stagger container — orchestrates content entrance ── */}
              <motion.div
                variants={containerVariants}
                initial={prefersReduced ? 'visible' : 'hidden'}
                animate="visible"
                exit="exit"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  flex: 1,
                  overflow: 'hidden',
                }}
              >

                {/* ── 1. Drag handle ── */}
                <motion.div
                  variants={itemVariants}
                  onPointerDown={e => dragControls.start(e)}
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    padding: '12px 0 4px',
                    cursor: 'grab',
                    touchAction: 'none',
                    flexShrink: 0,
                  }}
                >
                  <div style={{
                    width: 36, height: 4,
                    borderRadius: 2,
                    background: '#D4D3CE',
                  }} />
                </motion.div>

                {/* ── 2. Header ── */}
                <motion.div
                  variants={itemVariants}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 20px 12px',
                    flexShrink: 0,
                    borderBottom: '1px solid #EEEDEA',
                  }}
                >
                  <span style={{
                    fontSize: 15, fontWeight: 500,
                    color: '#1A1917',
                    letterSpacing: '-0.01em',
                  }}>
                    Filter
                  </span>
                  <button
                    type="button"
                    onClick={hasFilters ? clearAll : undefined}
                    style={{
                      fontFamily: 'inherit',
                      fontSize: 13, fontWeight: 500,
                      color: hasFilters ? '#3A3F8F' : '#B8B7B1',
                      background: 'none', border: 'none',
                      cursor: hasFilters ? 'pointer' : 'default',
                      padding: 4,
                      letterSpacing: '-0.01em',
                      pointerEvents: hasFilters ? 'all' : 'none',
                      transition: 'color .15s',
                    }}
                  >
                    Clear all
                  </button>
                </motion.div>

                {/* ── Scrollable body ── */}
                <div style={{ overflowY: 'auto', padding: '0 20px 32px', flex: 1 }}>

                  {/* ── 3. Insurance type ── */}
                  <motion.div variants={itemVariants}>
                    <span style={sectionLabel}>Insurance type</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {(['auto', 'home'] as const).map(t => {
                        const on = filters.types[t]
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => toggleType(t)}
                            style={{
                              flex: 1,
                              fontFamily: 'inherit',
                              fontSize: 13, fontWeight: 500,
                              padding: '10px 8px',
                              borderRadius: 10,
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
                  </motion.div>

                  {/* ── 4. Provider pills ── */}
                  <motion.div variants={itemVariants}>
                    <span style={sectionLabel}>Provider</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
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
                              padding: '6px 13px',
                              borderRadius: 9999,
                              border: `1px solid ${on ? '#1A1917' : '#D4D3CE'}`,
                              background: on ? '#1A1917' : '#FFFFFF',
                              color: on ? '#FFFFFF' : '#5E5D56',
                              cursor: 'pointer',
                              transition: 'all .18s cubic-bezier(.16,1,.3,1)',
                              letterSpacing: '-0.01em',
                              whiteSpace: 'nowrap',
                              lineHeight: 1,
                            }}
                          >
                            {name}
                          </button>
                        )
                      })}
                    </div>
                  </motion.div>

                  {/* ── 5. Rate increase range ── */}
                  <motion.div variants={itemVariants}>
                    <span style={sectionLabel}>Rate increase</span>
                    <div style={{ position: 'relative', paddingBottom: 4 }}>

                      {/* Values */}
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
                        <span style={{ fontSize: 13, color: '#9A998F' }}>to</span>
                        <span style={{
                          fontSize: 22, fontWeight: 600, color: '#1A1917',
                          letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums',
                        }}>
                          {filters.rMax >= 50 ? '50%+' : `${filters.rMax}%`}
                        </span>
                      </div>

                      {/* Distribution bars */}
                      <div style={{
                        display: 'flex', alignItems: 'flex-end', gap: 1,
                        height: 20, marginBottom: 4,
                      }}>
                        {DIST.map((v, i) => (
                          <div
                            key={i}
                            style={{
                              flex: 1,
                              borderRadius: '2px 2px 0 0',
                              background: i >= filters.rMin && i <= filters.rMax ? '#B0B4E6' : '#EEEDEA',
                              height: `${Math.max(3, Math.round(v / DIST_MAX * 20))}px`,
                              transition: 'background .2s',
                            }}
                          />
                        ))}
                      </div>

                      <DualRange
                        valueMin={filters.rMin}
                        valueMax={filters.rMax}
                        onMinChange={setRMin}
                        onMaxChange={setRMax}
                      />

                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                        {['0%', '10%', '20%', '30%', '40%', '50%+'].map(l => (
                          <span key={l} style={{
                            fontFamily: "'IBM Plex Mono', monospace",
                            fontSize: 10, color: '#9A998F',
                          }}>
                            {l}
                          </span>
                        ))}
                      </div>
                    </div>
                  </motion.div>

                  {/* ── 6. Verified only ── */}
                  <motion.div variants={itemVariants}>
                    <span style={sectionLabel}>Trust</span>
                    <div style={{
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between', padding: '12px 0',
                    }}>
                      <div>
                        <div style={{
                          fontSize: 14, fontWeight: 500,
                          color: '#2C2B27', letterSpacing: '-0.01em',
                        }}>
                          Verified posts only
                        </div>
                        <div style={{ fontSize: 12, color: '#9A998F', marginTop: 2, lineHeight: 1.4 }}>
                          Show only posts backed by a renewal letter
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={toggleVerified}
                        aria-pressed={filters.verified}
                        style={{
                          width: 42, height: 24,
                          borderRadius: 9999,
                          background: filters.verified ? '#1A1917' : '#D4D3CE',
                          border: 'none',
                          cursor: 'pointer',
                          position: 'relative',
                          flexShrink: 0,
                          marginLeft: 16,
                          transition: 'background .2s cubic-bezier(.16,1,.3,1)',
                        }}
                      >
                        <span style={{
                          position: 'absolute',
                          width: 18, height: 18,
                          borderRadius: '50%',
                          background: '#FFFFFF',
                          top: 3,
                          left: filters.verified ? 21 : 3,
                          boxShadow: '0 1px 3px rgba(26,25,23,.14)',
                          transition: 'left .22s cubic-bezier(.16,1,.3,1)',
                          display: 'block',
                        }} />
                      </button>
                    </div>
                  </motion.div>

                </div>{/* /body */}

              </motion.div>{/* /stagger container */}

            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
