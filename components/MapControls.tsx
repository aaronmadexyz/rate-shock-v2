'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { springs } from '@/lib/springs'
import { TOKENS } from '@/lib/tokens'
import type { UserProfile } from '@/lib/types'
import type { FilterState } from '@/lib/types'
import type { CohortResult } from '@/lib/cohortMatch'
import { ComponentErrorBoundary } from '@/components/ComponentErrorBoundary'
import styles from '@/styles/MapControls.module.css'

// Sheet has its own slide-up entrance — only loaded when Filter is tapped
const FilterSheet = dynamic(
  () => import('@/components/FilterSheet'),
  { ssr: false, loading: () => null }
)

const SH_SM = TOKENS.shadows.shadowSm

const TAP_SNAPPY = { type: 'spring' as const, ...springs.snappy }

function FilterIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M1 2.5h11M3.5 6.5h6M6 10.5h1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}

function ProfilesIcon({ active }: { active?: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="5" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M1 11.5c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="9.5" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.1" opacity={active ? 1 : 0.6}/>
      <path d="M11.5 11c0-1.65-1.35-3-3-3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity={active ? 1 : 0.6}/>
    </svg>
  )
}

function CohortCard({ result, profile }: { result: CohortResult | null; profile: UserProfile | null }) {
  if (!result) {
    return (
      <div style={{
        background:   'var(--n-0)',
        border:       `1px solid var(--n-150)`,
        borderRadius: 'var(--r-md)',
        padding:      '10px 12px',
        boxShadow:    SH_SM,
        maxWidth:     280,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <ProfilesIcon />
          <span style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: 12, fontWeight: 500, color: 'var(--n-500)',
          }}>
            Not enough similar profiles yet
          </span>
        </div>
        <p style={{
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: 11, color: 'var(--n-400)', lineHeight: 1.5, margin: 0,
        }}>
          Need 8+ to build a cohort. Showing all{' '}
          {profile?.insurance_type ?? ''} renewals.
        </p>
      </div>
    )
  }

  const tierLabel = result.tier === 2
    ? `Exact match · ${profile?.provider ?? ''}`
    : result.tier === 1
    ? `${profile?.provider ?? ''} · ${profile?.insurance_type ?? ''}`
    : `All ${profile?.insurance_type ?? ''} renewals`

  const tierNote = result.tier === 1
    ? 'Broadened to same provider — not enough exact matches.'
    : result.tier === 'fallback'
    ? 'Broadened to all renewals — not enough provider matches.'
    : null

  return (
    <div style={{
      background:   'var(--n-0)',
      border:       `1px solid var(--n-150)`,
      borderRadius: 'var(--r-md)',
      padding:      '10px 12px',
      boxShadow:    SH_SM,
      maxWidth:     280,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <ProfilesIcon active />
        <span style={{
          fontFamily:    "'Inter', system-ui, sans-serif",
          fontSize:      11, fontWeight: 500, color: 'var(--n-400)',
          textTransform: 'uppercase', letterSpacing: '.04em',
        }}>
          {tierLabel}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{
          fontFamily:         "'Inter', system-ui, sans-serif",
          fontSize:           22, fontWeight: 600, color: 'var(--n-900)',
          letterSpacing:      '-.02em',
          fontVariantNumeric: 'tabular-nums',
        }}>
          +{result.median}%
        </span>
        <span style={{
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize:   12, color: 'var(--n-400)',
        }}>
          median · {result.count} profiles
        </span>
      </div>
      <div style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize:   11, color: 'var(--n-500)', marginTop: 4,
      }}>
        Range: +{result.min}% – +{result.max}%
      </div>
      {tierNote && (
        <p style={{
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize:   11, color: 'var(--n-400)', lineHeight: 1.5,
          marginTop:  6, marginBottom: 0,
        }}>
          {tierNote}
        </p>
      )}
    </div>
  )
}

interface MapControlsProps {
  activeCount:    number
  matchCount:     number
  onClick:        () => void
  isFilterOpen:   boolean
  onFilterClose:  () => void
  onFilterChange: (f: FilterState) => void
  onCtaClick?:    () => void
  mapRef?:        React.MutableRefObject<unknown>
  hasSubmission:  boolean
  likeMeMode:     boolean
  onLikeMeToggle: () => void
  userProfile:    UserProfile | null
  cohortResult:   CohortResult | null
}

const NUDGE_SESSION_KEY = 'rateshock_filter_nudge_seen'

function MapControls({
  activeCount, matchCount, onClick, isFilterOpen, onFilterClose, onFilterChange,
  hasSubmission, likeMeMode, onLikeMeToggle, userProfile, cohortResult,
}: MapControlsProps) {
  const isActive       = activeCount > 0
  const prefersReduced = useReducedMotion()
  const [isMobile,     setIsMobile]     = useState(false)
  const [nudgeVisible, setNudgeVisible] = useState(false)
  const [nudgeActive,  setNudgeActive]  = useState(false)
  const nudgeTimeouts  = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 680px)')
    setIsMobile(mq.matches)
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])

  const cancelNudge = useCallback(() => {
    nudgeTimeouts.current.forEach(clearTimeout)
    nudgeTimeouts.current = []
    setNudgeVisible(false)
    setNudgeActive(false)
    sessionStorage.setItem(NUDGE_SESSION_KEY, '1')
  }, [])

  // First-visit attention nudge sequence
  useEffect(() => {
    if (sessionStorage.getItem(NUDGE_SESSION_KEY)) return
    const delay = window.innerWidth < 680 ? 5000 : 4500

    const push = (fn: () => void, ms: number) => {
      const id = setTimeout(fn, ms)
      nudgeTimeouts.current.push(id)
      return id
    }

    push(() => {
      if (sessionStorage.getItem(NUDGE_SESSION_KEY)) return

      // Part A — tooltip appears
      setNudgeVisible(true)

      // Part B — pill pulse at +200ms
      push(() => {
        setNudgeActive(true)
        push(() => setNudgeActive(false), 900)
      }, 200)

      // Part C — tooltip exits at +2000ms
      push(() => setNudgeVisible(false), 2000)

      // Cleanup at +2800ms
      push(() => {
        sessionStorage.setItem(NUDGE_SESSION_KEY, '1')
        nudgeTimeouts.current = []
      }, 2800)
    }, delay)

    return () => {
      nudgeTimeouts.current.forEach(clearTimeout)
      nudgeTimeouts.current = []
    }
  }, []) // runs once on mount

  const handleFilterClick = useCallback(() => {
    if (nudgeVisible || nudgeActive || nudgeTimeouts.current.length > 0) cancelNudge()
    onClick()
  }, [nudgeVisible, nudgeActive, cancelNudge, onClick])

  // Correction 4: cohort card scales from bottom-left corner
  const cohortTransition = prefersReduced
    ? { duration: 0 }
    : { type: 'spring' as const, ...springs.snappy }

  // Correction 6: tap spring respects reduced motion
  const tapTransition = prefersReduced
    ? { duration: 0 }
    : TAP_SNAPPY

  // Nudge tooltip transition — instant if reduced motion
  const nudgeTransition = prefersReduced
    ? { duration: 0 }
    : { type: 'spring' as const, ...springs.responsive }

  return (
    <>
      {/* Cohort card — absolutely positioned above the bottom-left group */}
      {/* position: absolute resolves against .bottomLeft (position: relative) */}
      <AnimatePresence>
        {likeMeMode && hasSubmission && (
          <motion.div
            key="cohort-card"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={cohortTransition}
            style={{
              position:        'absolute',
              bottom:          'calc(100% + 8px)',
              left:            0,
              transformOrigin: 'bottom left',  // Correction 4
            }}
          >
            <CohortCard result={cohortResult} profile={userProfile} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter pill + floating card + nudge — wrapped in position:relative */}
      <div className={styles.filterWrapper}>
        <ComponentErrorBoundary name="FilterSheet">
          <FilterSheet
            isOpen={isFilterOpen}
            onClose={onFilterClose}
            onChange={onFilterChange}
            matchCount={matchCount}
          />
        </ComponentErrorBoundary>

        {/* First-visit attention nudge tooltip */}
        <AnimatePresence>
          {nudgeVisible && (
            <motion.div
              key="filter-nudge"
              role="tooltip"
              id="filter-nudge-tooltip"
              style={{
                position:      'absolute',
                bottom:        'calc(100% + 10px)',
                left:          0,
                whiteSpace:    'nowrap',
                pointerEvents: 'none',
                zIndex:        TOKENS.zIndex.zNudge, // --z-nudge: 460 — above filter overlay card
                transformOrigin: 'bottom left',
              }}
              initial={{ opacity: 0, y: 4, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={prefersReduced
                ? { opacity: 0, transition: { duration: 0.15 } }
                : { opacity: 0, y: 4, scale: 0.97, transition: { duration: 0.15 } }}
              transition={nudgeTransition}
            >
              <div style={{
                background:   'var(--n-900)',
                color:        'var(--n-0)',
                fontFamily:   "'Inter', system-ui, sans-serif",
                fontSize:     12,
                fontWeight:   500,
                padding:      '6px 12px',
                borderRadius: 9999,
                boxShadow:    '0 4px 12px rgba(26,25,23,.06), 0 1px 3px rgba(26,25,23,.04)',
                display:      'flex',
                alignItems:   'center',
                gap:          6,
                position:     'relative',
              }}>
                Filter by provider or rate
                {/* Downward caret */}
                <svg
                  width="10" height="5" viewBox="0 0 10 5" fill="none"
                  aria-hidden="true"
                  style={{ position: 'absolute', bottom: -5, left: 20 }}
                >
                  <path d="M0 0L5 5L10 0" fill="var(--n-900)" />
                </svg>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* sr-only live region — announces nudge to screen readers */}
        <div aria-live="polite" className={styles.srOnly}>
          {nudgeVisible
            ? 'Tip: use Filter results to narrow the map by provider or rate increase'
            : ''}
        </div>

        {/* nudgeRing span: wrapper for the pulse ring so it doesn't conflict with button's inline boxShadow */}
        <span className={nudgeActive ? styles.nudgeRing : undefined}>
        <motion.button
          type="button"
          onClick={handleFilterClick}
          aria-expanded={isFilterOpen}
          aria-haspopup="true"
          aria-controls="filter-panel"
          aria-describedby={nudgeVisible ? 'filter-nudge-tooltip' : undefined}
          style={{
            fontFamily:      "'Inter', system-ui, sans-serif",
            fontSize:        13,
            fontWeight:      500,
            letterSpacing:   '-0.01em',
            lineHeight:      1,
            cursor:          'pointer',
            display:         'inline-flex',
            alignItems:      'center',
            gap:             7,
            height:          40,
            padding:         '0 14px',
            borderRadius:    9999,
            border:          nudgeActive
              ? '1px solid var(--p-400)'
              : isActive ? '1px solid var(--p-200)' : '1px solid var(--n-200)',
            backgroundColor: isActive ? 'var(--p-50)' : 'var(--n-0)',
            color:           isActive ? 'var(--p-600)' : 'var(--n-800)',
            boxShadow:       SH_SM,
          }}
          whileHover={isActive ? {} : { backgroundColor: 'var(--n-25)', borderColor: 'var(--n-300)' }}
          whileTap={{ scale: 0.97, transition: tapTransition }}
        >
          <FilterIcon />
          <span className={styles.filterLabelFull}>Filter results</span>
          <span className={styles.filterLabelShort}>Filter</span>
          {isActive && (
            <span style={{
              fontFamily:      "'IBM Plex Mono', monospace",
              fontSize:        10,
              fontWeight:      500,
              lineHeight:      1.4,
              backgroundColor: 'var(--p-600)',
              color:           'var(--n-0)',
              padding:         '2px 6px',
              borderRadius:    9999,
            }}>
              {activeCount}
            </span>
          )}
        </motion.button>
        </span>
      </div>

      {/* Like Me toggle — only after submission */}
      {hasSubmission && (
        <motion.button
          type="button"
          onClick={onLikeMeToggle}
          aria-pressed={likeMeMode}
          aria-label="Like me — show renewals matching my profile"
          style={{
            cursor:          'pointer',
            display:         'inline-flex',
            alignItems:      'center',
            justifyContent:  'center',
            gap:             isMobile ? 0 : 7,
            height:          40,
            width:           isMobile ? 40 : 'auto',
            padding:         isMobile ? 0 : '0 14px',
            borderRadius:    9999,
            border:          likeMeMode ? '1px solid var(--p-200)' : '1px solid var(--n-200)',
            backgroundColor: likeMeMode ? 'var(--p-50)' : 'var(--n-0)',
            color:           likeMeMode ? 'var(--p-600)' : 'var(--n-800)',
            boxShadow:       SH_SM,
            fontFamily:      "'Inter', system-ui, sans-serif",
            fontSize:        13,
            fontWeight:      500,
            letterSpacing:   '-0.01em',
            lineHeight:      1,
          }}
          whileHover={likeMeMode ? {} : { backgroundColor: 'var(--n-25)', borderColor: 'var(--n-300)' }}
          whileTap={{ scale: 0.97, transition: tapTransition }}
        >
          <ProfilesIcon active={likeMeMode} />
          {!isMobile && <span style={{ marginLeft: 7 }}>Like me</span>}
        </motion.button>
      )}

    </>
  )
}

export default React.memo(MapControls)
