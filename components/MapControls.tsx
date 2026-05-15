'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import type { Map as LeafletMap } from 'leaflet'
import { springs } from '@/lib/springs'
import PostalCodeSearch from '@/components/PostalCodeSearch'
import type { UserProfile } from '@/lib/types'
import type { CohortResult } from '@/lib/cohortMatch'

const SH_SM = '0 1px 3px rgba(26,25,23,.06), 0 1px 2px rgba(26,25,23,.04)'

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
        background:   '#FFFFFF',
        border:       '1px solid #E2E1DD',
        borderRadius: 10,
        padding:      '10px 12px',
        boxShadow:    SH_SM,
        maxWidth:     280,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <ProfilesIcon />
          <span style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: 12, fontWeight: 500, color: '#7C7B72',
          }}>
            Not enough similar profiles yet
          </span>
        </div>
        <p style={{
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: 11, color: '#9A998F', lineHeight: 1.5, margin: 0,
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
      background:   '#FFFFFF',
      border:       '1px solid #E2E1DD',
      borderRadius: 10,
      padding:      '10px 12px',
      boxShadow:    SH_SM,
      maxWidth:     280,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <ProfilesIcon active />
        <span style={{
          fontFamily:    "'Inter', system-ui, sans-serif",
          fontSize:      10, fontWeight: 500, color: '#9A998F',
          textTransform: 'uppercase', letterSpacing: '.04em',
        }}>
          {tierLabel}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{
          fontFamily:         "'Inter', system-ui, sans-serif",
          fontSize:           22, fontWeight: 600, color: '#1A1917',
          letterSpacing:      '-.02em',
          fontVariantNumeric: 'tabular-nums',
        }}>
          +{result.median}%
        </span>
        <span style={{
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize:   12, color: '#9A998F',
        }}>
          median · {result.count} profiles
        </span>
      </div>
      <div style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize:   11, color: '#B8B7B1', marginTop: 2,
      }}>
        Range: +{result.min}% – +{result.max}%
      </div>
      {tierNote && (
        <p style={{
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize:   11, color: '#9A998F', lineHeight: 1.5,
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
  onClick:        () => void
  onCtaClick:     () => void
  mapRef:         React.MutableRefObject<LeafletMap | null>
  hasSubmission:  boolean
  likeMeMode:     boolean
  onLikeMeToggle: () => void
  userProfile:    UserProfile | null
  cohortResult:   CohortResult | null
}

function MapControls({
  activeCount, onClick, onCtaClick, mapRef,
  hasSubmission, likeMeMode, onLikeMeToggle, userProfile, cohortResult,
}: MapControlsProps) {
  const isActive      = activeCount > 0
  const prefersReduced = useReducedMotion()
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 680px)')
    setIsMobile(mq.matches)
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])

  // Correction 4: cohort card scales from bottom-left corner
  const cohortTransition = prefersReduced
    ? { duration: 0 }
    : { type: 'spring' as const, ...springs.snappy }

  // Correction 6: tap spring respects reduced motion
  const tapTransition = prefersReduced
    ? { duration: 0 }
    : TAP_SNAPPY

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

      {/* Filter pill */}
      <motion.button
        type="button"
        onClick={onClick}
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
          border:          isActive ? '1px solid #B0B4E6' : '1px solid #D4D3CE',
          backgroundColor: isActive ? '#EEEFFA' : '#FFFFFF',
          color:           isActive ? '#3A3F8F' : '#2C2B27',
          boxShadow:       SH_SM,
        }}
        whileHover={isActive ? {} : { backgroundColor: '#FAFAF8', borderColor: '#B8B7B1' }}
        whileTap={{ scale: 0.97, transition: tapTransition }}
      >
        <FilterIcon />
        Filter
        {isActive && (
          <span style={{
            fontFamily:      "'IBM Plex Mono', monospace",
            fontSize:        10,
            fontWeight:      500,
            lineHeight:      1.4,
            backgroundColor: '#3A3F8F',
            color:           '#FFFFFF',
            padding:         '2px 6px',
            borderRadius:    999,
          }}>
            {activeCount}
          </span>
        )}
      </motion.button>

      {/* Like Me toggle — only after submission */}
      {hasSubmission && (
        <motion.button
          type="button"
          onClick={onLikeMeToggle}
          aria-pressed={likeMeMode}
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
            border:          likeMeMode ? '1px solid #B0B4E6' : '1px solid #D4D3CE',
            backgroundColor: likeMeMode ? '#EEEFFA' : '#FFFFFF',
            color:           likeMeMode ? '#3A3F8F' : '#2C2B27',
            boxShadow:       SH_SM,
            fontFamily:      "'Inter', system-ui, sans-serif",
            fontSize:        13,
            fontWeight:      500,
            letterSpacing:   '-0.01em',
            lineHeight:      1,
          }}
          whileHover={likeMeMode ? {} : { backgroundColor: '#FAFAF8', borderColor: '#B8B7B1' }}
          whileTap={{ scale: 0.97, transition: tapTransition }}
        >
          <ProfilesIcon active={likeMeMode} />
          {!isMobile && <span style={{ marginLeft: 7 }}>Like me</span>}
        </motion.button>
      )}

      {/* Search */}
      <PostalCodeSearch mapRef={mapRef} onCtaClick={onCtaClick} />
    </>
  )
}

export default React.memo(MapControls)
