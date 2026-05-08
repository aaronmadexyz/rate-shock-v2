'use client'

import React from 'react'
import { motion } from 'framer-motion'
import type { Map as LeafletMap } from 'leaflet'
import { springs } from '@/lib/springs'
import PostalCodeSearch from '@/components/PostalCodeSearch'
import type { UserProfile } from '@/lib/types'
import type { CohortResult } from '@/lib/cohortMatch'

// ─── Constants ────────────────────────────────────────────────────────────────

const SH_SM = '0 1px 3px rgba(26,25,23,.06), 0 1px 2px rgba(26,25,23,.04)'

const TAP = {
  scale: 0.97,
  transition: { type: 'spring' as const, ...springs.snappy },
} as const

// ─── Icons ────────────────────────────────────────────────────────────────────

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

// ─── Cohort card ──────────────────────────────────────────────────────────────

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
            fontSize:   12, fontWeight: 500, color: '#7C7B72',
          }}>
            Not enough similar profiles yet
          </span>
        </div>
        <p style={{
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize:   11, color: '#9A998F', lineHeight: 1.5, margin: 0,
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

// ─── Props ────────────────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

function MapControls({
  activeCount, onClick, onCtaClick, mapRef,
  hasSubmission, likeMeMode, onLikeMeToggle, userProfile, cohortResult,
}: MapControlsProps) {
  const isActive = activeCount > 0

  return (
    <>
      <style>{`
        @media (max-width: 680px) {
          .mc-wrap { bottom: 20px !important; left: 16px !important; }
        }
      `}</style>

      <div
        className="mc-wrap"
        style={{
          position:      'fixed',
          bottom:        28,
          left:          24,
          zIndex:        99,
          display:       'flex',
          flexDirection: 'column',
          alignItems:    'flex-start',
          gap:           8,
        }}
      >
        {/* Cohort card — only when Like Me mode is active */}
        {likeMeMode && hasSubmission && (
          <CohortCard result={cohortResult} profile={userProfile} />
        )}

        {/* Button row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
              padding:         '8px 14px',
              borderRadius:    9999,
              border:          isActive ? '1px solid #B0B4E6' : '1px solid #D4D3CE',
              backgroundColor: isActive ? '#EEEFFA' : '#FFFFFF',
              color:           isActive ? '#3A3F8F' : '#2C2B27',
              boxShadow:       SH_SM,
            }}
            whileHover={isActive ? {} : { backgroundColor: '#FAFAF8', borderColor: '#B8B7B1' }}
            whileTap={TAP}
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

          {/* Like Me toggle — only shown after user has submitted */}
          {hasSubmission && (
            <motion.button
              type="button"
              onClick={onLikeMeToggle}
              aria-pressed={likeMeMode}
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
                padding:         '8px 14px',
                borderRadius:    9999,
                border:          likeMeMode ? '1px solid #B0B4E6' : '1px solid #D4D3CE',
                backgroundColor: likeMeMode ? '#EEEFFA' : '#FFFFFF',
                color:           likeMeMode ? '#3A3F8F' : '#2C2B27',
                boxShadow:       SH_SM,
              }}
              whileHover={likeMeMode ? {} : { backgroundColor: '#FAFAF8', borderColor: '#B8B7B1' }}
              whileTap={TAP}
            >
              <ProfilesIcon active={likeMeMode} />
              Like me
            </motion.button>
          )}

          {/* Postal code search */}
          <PostalCodeSearch mapRef={mapRef} onCtaClick={onCtaClick} />
        </div>
      </div>
    </>
  )
}

export default React.memo(MapControls)
