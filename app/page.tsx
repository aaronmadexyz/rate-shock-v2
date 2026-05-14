'use client'

// Prevent static prerender — page depends on client-side Supabase and Leaflet
export const dynamic = 'force-dynamic'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getTimeOfDay, timeOfDayTokens } from '@/lib/timeOfDay'
import lazyLoad from 'next/dynamic'
import type { Map as LeafletMap } from 'leaflet'
import Nav from '@/components/Nav'
import MapControls from '@/components/MapControls'
import FilterSheet, { countFilters } from '@/components/FilterSheet'
import type { FilterState } from '@/lib/types'
import ShareRenewalModal from '@/components/ShareRenewalModal'
import FeatureRequestButton from '@/components/FeatureRequestButton'
import MapLegend from '@/components/MapLegend'
import { MapErrorBoundary } from '@/components/MapErrorBoundary'
import type { Submission, MapViewHandle, UserProfile } from '@/lib/types'
import type { CohortResult } from '@/lib/cohortMatch'
import { safeGetItem, safeSetItem } from '@/lib/storage'
import OnboardingOverlay from '@/components/OnboardingOverlay'

// Leaflet requires browser APIs — skip SSR entirely
const MapView = lazyLoad(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => (
    <div style={{ position: 'fixed', inset: 0, background: '#F5F4F1', zIndex: 0 }} />
  ),
})

const DEFAULT_FILTERS: FilterState = {
  types: { auto: true, home: true },
  provs: [],
  rMin: 0,
  rMax: 50,
  verified: false,
}

export default function Page() {
  const [mounted,       setMounted]      = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [modalOpen,    setModalOpen]    = useState(false)
  const [filterOpen,   setFilterOpen]   = useState(false)
  const [filters,      setFilters]      = useState<FilterState>(DEFAULT_FILTERS)
  const [likeMeMode,   setLikeMeMode]   = useState(false)
  const [userProfile,  setUserProfile]  = useState<UserProfile | null>(null)
  const [hasSubmission, setHasSubmission] = useState(false)
  const [cohortResult, setCohortResult] = useState<CohortResult | null>(null)

  // Mark mounted, then show onboarding after 800ms if not seen
  useEffect(() => {
    setMounted(true)
    if (safeGetItem('rateshock_onboarding_seen')) return
    const t = setTimeout(() => setShowOnboarding(true), 800)
    return () => clearTimeout(t)
  }, [])

  const handleOnboardingDismiss = useCallback(() => {
    safeSetItem('rateshock_onboarding_seen', 'true')
    setShowOnboarding(false)
  }, [])

  const handleOnboardingSubmit = useCallback(() => {
    safeSetItem('rateshock_onboarding_seen', 'true')
    setShowOnboarding(false)
    setModalOpen(true)
  }, [])

  // Read persisted profile + likeMeMode on mount
  useEffect(() => {
    const stored = safeGetItem('ratemap_user_profile')
    if (stored) {
      try {
        setUserProfile(JSON.parse(stored) as UserProfile)
        setHasSubmission(true)
        const savedMode = safeGetItem('rateshock_like_me_mode')
        if (savedMode === 'true') setLikeMeMode(true)
      } catch { /* ignore */ }
    } else {
      setLikeMeMode(false)
    }
  }, [])

  // Stable ref to MapView's handle — allows prepending without a re-fetch
  const mapHandle = useRef<MapViewHandle | null>(null)
  const onMapReady = useCallback((h: MapViewHandle) => { mapHandle.current = h }, [])

  // Leaflet map instance — forwarded to MapControls for PostalCodeSearch flyTo
  const leafletMapRef = useRef<LeafletMap | null>(null)
  const onLeafletReady = useCallback((m: LeafletMap) => { leafletMapRef.current = m }, [])

  // Apply time-of-day CSS tokens on mount and refresh every hour
  useEffect(() => {
    function apply() {
      const tokens = timeOfDayTokens[getTimeOfDay()]
      Object.entries(tokens).forEach(([key, value]) => {
        document.documentElement.style.setProperty(key, value)
      })
    }
    apply()
    const id = setInterval(apply, 60 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  const handleFilterChange = useCallback((f: FilterState) => setFilters(f), [])

  const handleLikeMeToggle = useCallback(() => {
    setLikeMeMode(prev => {
      const next = !prev
      safeSetItem('rateshock_like_me_mode', next.toString())
      return next
    })
  }, [])

  const handleZoomToPost = useCallback((fsa: string) => {
    setTimeout(() => mapHandle.current?.flyToFsa(fsa), 400)
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableFilters = useMemo(() => filters, [JSON.stringify(filters)])

  const activeFilterCount = countFilters(filters)

  const handleSubmitted = useCallback((sub: Submission) => {
    mapHandle.current?.prependSubmission(sub)
    // ShareRenewalModal writes ratemap_user_profile before calling onSubmitted
    const stored = safeGetItem('ratemap_user_profile')
    if (stored) {
      try {
        setUserProfile(JSON.parse(stored) as UserProfile)
        setHasSubmission(true)
      } catch { /* ignore */ }
    }
  }, [])

  const handleCohortResult = useCallback((r: CohortResult | null) => {
    setCohortResult(r)
  }, [])

  const handleVerify = useCallback(() => {
    setModalOpen(false)
  }, [])

  // Hero hint — shows once per session on first visit
  const [heroVisible, setHeroVisible] = useState(false)
  useEffect(() => {
    if (sessionStorage.getItem('rateshock_hero_shown')) return
    sessionStorage.setItem('rateshock_hero_shown', '1')
    setHeroVisible(true)
    const t = setTimeout(() => setHeroVisible(false), 4000)
    return () => clearTimeout(t)
  }, [])

  return (
    <>
      {/* Map — fills the viewport at z-index 0 */}
      <MapErrorBoundary>
        <MapView
          filters={stableFilters}
          onReady={onMapReady}
          onLeafletReady={onLeafletReady}
          likeMeMode={likeMeMode}
          userProfile={userProfile}
          onCohortResult={handleCohortResult}
          onCtaClick={() => setModalOpen(true)}
        />
      </MapErrorBoundary>

      {/* Fixed nav — above the map via z-index in globals.css (--z-nav: 100) */}
      <Nav onCtaClick={() => setModalOpen(true)} />

      {/* Filter button — bottom-left */}
      <MapControls
        activeCount={activeFilterCount}
        onClick={() => setFilterOpen(true)}
        onCtaClick={() => setModalOpen(true)}
        mapRef={leafletMapRef}
        hasSubmission={hasSubmission}
        likeMeMode={likeMeMode}
        onLikeMeToggle={handleLikeMeToggle}
        userProfile={userProfile}
        cohortResult={cohortResult}
      />

      {/* Filter sheet */}
      <FilterSheet
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        onChange={handleFilterChange}
      />

      {/* Renewal modal */}
      <ShareRenewalModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onVerify={handleVerify}
        onSubmitted={handleSubmitted}
        onZoomToPost={handleZoomToPost}
        onEnableLikeMe={() => setLikeMeMode(true)}
      />

      {/* First-visit hero hint */}
      <AnimatePresence>
        {heroVisible && !modalOpen && !filterOpen && (
          <motion.div
            key="hero-hint"
            initial={{ opacity: 0, y: -4, x: '-50%' }}
            animate={{ opacity: 1, y: 0,  x: '-50%' }}
            exit={{ opacity: 0, y: -4, x: '-50%', transition: { duration: 0.6, ease: 'easeOut' } }}
            transition={{ type: 'spring', stiffness: 240, damping: 24, mass: 1 }}
            style={{
              position:      'fixed',
              top:           80,
              left:          '50%',
              zIndex:        19,
              pointerEvents: 'none',
            }}
          >
            <div style={{
              background:           'rgba(255,255,255,0.92)',
              backdropFilter:       'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border:               '1px solid #E2E1DD',
              borderRadius:         9999,
              padding:              '10px 20px',
              fontFamily:           "'Inter', system-ui, sans-serif",
              fontSize:             13,
              fontWeight:           500,
              color:                '#1A1917',
              whiteSpace:           'nowrap',
              boxShadow:            '0 1px 3px rgba(26,25,23,.06)',
              pointerEvents:        'none',
            }}>
              See what Ontario drivers are really paying — tap an envelope to explore
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <MapLegend />
      <FeatureRequestButton />

      {/* First-visit onboarding overlay */}
      {mounted && (
        <OnboardingOverlay
          isVisible={showOnboarding}
          onDismiss={handleOnboardingDismiss}
          onSubmit={handleOnboardingSubmit}
        />
      )}
    </>
  )
}
