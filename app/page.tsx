'use client'

// Prevent static prerender — page depends on client-side Supabase and Leaflet
export const dynamic = 'force-dynamic'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { getTimeOfDay, timeOfDayTokens } from '@/lib/timeOfDay'
import lazyLoad from 'next/dynamic'
import type { Map as LeafletMap } from 'leaflet'
import Nav from '@/components/Nav'
import MapControls from '@/components/MapControls'
import { countFilters } from '@/components/FilterSheet'
import type { FilterState } from '@/lib/types'
import FeatureRequestButton from '@/components/FeatureRequestButton'
import LegendButton from '@/components/LegendButton'
import { MapErrorBoundary } from '@/components/MapErrorBoundary'
import { ComponentErrorBoundary } from '@/components/ComponentErrorBoundary'
import mcStyles from '@/styles/MapControls.module.css'
import type { Submission, MapViewHandle, UserProfile } from '@/lib/types'
import type { CohortResult } from '@/lib/cohortMatch'
import { safeGetItem, safeSetItem } from '@/lib/storage'
import { TOKENS } from '@/lib/tokens'
// OnboardingOverlay is static — must be available immediately on first mount
import OnboardingOverlay from '@/components/OnboardingOverlay'

// Leaflet requires browser APIs — skip SSR entirely
const MapView = lazyLoad(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--n-50)', zIndex: 0 /* z-map */ }} />
  ),
})

// Modal is client-only (animations, localStorage, Supabase) — only shown on CTA tap
const ShareRenewalModal = lazyLoad(
  () => import('@/components/ShareRenewalModal'),
  { ssr: false, loading: () => null }
)

const DEFAULT_FILTERS: FilterState = {
  insuranceType: null,
  provider:      null,
  rMin:          -30,
  rMax:          50,
}

function parseUserProfile(raw: string): UserProfile | null {
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.fsa !== 'string') return null
    return parsed as UserProfile
  } catch {
    return null
  }
}

export default function Page() {
  const prefersReduced = useReducedMotion()

  const [mounted,       setMounted]      = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [modalOpen,       setModalOpen]       = useState(false)
  const [modalInitialFsa, setModalInitialFsa] = useState<string | undefined>()
  const [frOpen,       setFrOpen]       = useState(false)
  const [filterOpen,   setFilterOpen]   = useState(false)
  const [filters,      setFilters]      = useState<FilterState>(DEFAULT_FILTERS)
  const [matchCount,   setMatchCount]   = useState(0)
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

  // Opens modal and optionally pre-fills the FSA (from NeighbourhoodPanel CTA)
  const openModalWithFsa = useCallback((fsa?: string) => {
    if (fsa) setModalInitialFsa(fsa)
    setModalOpen(true)
  }, [])

  // Clears pre-fill so next open (from Nav etc.) starts fresh
  const handleModalClose = useCallback(() => {
    setModalInitialFsa(undefined)
    setModalOpen(false)
  }, [])

  // Read persisted profile + likeMeMode on mount
  useEffect(() => {
    const stored = safeGetItem('ratemap_user_profile')
    if (stored) {
      const profile = parseUserProfile(stored)
      if (profile) {
        setUserProfile(profile)
        setHasSubmission(true)
        const savedMode = safeGetItem('rateshock_like_me_mode')
        if (savedMode === 'true') setLikeMeMode(true)
      }
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
      const profile = parseUserProfile(stored)
      if (profile) { setUserProfile(profile); setHasSubmission(true) }
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
    // Root element — previously a fragment; now a real DOM node so the
    // overall viewport shell has a single anchoring element.
    // All children use position:fixed so this div has no layout effect.
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
      {/* Map — fills the viewport at z-index 0 */}
      <MapErrorBoundary>
        <MapView
          filters={stableFilters}
          onReady={onMapReady}
          onLeafletReady={onLeafletReady}
          likeMeMode={likeMeMode}
          userProfile={userProfile}
          onCohortResult={handleCohortResult}
          onCtaClick={openModalWithFsa}
          onMatchCountChange={setMatchCount}
        />
      </MapErrorBoundary>

      {/* Two-tier nav: data strip (z:101) + main bar (z:100) */}
      <ComponentErrorBoundary name="Nav">
        <Nav
          onCtaClick={() => setModalOpen(true)}
          mapRef={leafletMapRef}
          onOpenFeatureRequest={() => setFrOpen(true)}
        />
      </ComponentErrorBoundary>

      {/* Bottom control bar */}
      <div className={mcStyles.bottomBar}>
        <div className={mcStyles.bottomLeft}>
          <MapControls
            activeCount={activeFilterCount}
            matchCount={matchCount}
            onClick={() => setFilterOpen(f => !f)}
            isFilterOpen={filterOpen}
            onFilterClose={() => setFilterOpen(false)}
            onFilterChange={handleFilterChange}
            hasSubmission={hasSubmission}
            likeMeMode={likeMeMode}
            onLikeMeToggle={handleLikeMeToggle}
            userProfile={userProfile}
            cohortResult={cohortResult}
          />
        </div>
        <div className={mcStyles.bottomRight}>
          <LegendButton />
        </div>
      </div>

      {/* Feature request modal — controlled from nav lightbulb */}
      <FeatureRequestButton isOpen={frOpen} onClose={() => setFrOpen(false)} />

      {/* Renewal modal */}
      <ComponentErrorBoundary name="ShareRenewalModal">
        <ShareRenewalModal
          isOpen={modalOpen}
          onClose={handleModalClose}
          initialFsa={modalInitialFsa}
          onVerify={handleVerify}
          onSubmitted={handleSubmitted}
          onZoomToPost={handleZoomToPost}
          onEnableLikeMe={() => setLikeMeMode(true)}
        />
      </ComponentErrorBoundary>

      {/* First-visit hero hint */}
      <AnimatePresence>
        {heroVisible && !modalOpen && !filterOpen && (
          <motion.div
            key="hero-hint"
            initial={prefersReduced ? { opacity: 0, x: '-50%' } : { opacity: 0, y: -4, x: '-50%' }} /* prefers-reduced-motion: opacity only, no y-shift ✓ */
            animate={prefersReduced ? { opacity: 1, x: '-50%' } : { opacity: 1, y: 0,  x: '-50%' }}
            exit={{ opacity: 0, ...(prefersReduced ? { x: '-50%' } : { y: -4, x: '-50%' }), transition: { duration: 0.15, ease: [0.4, 0, 1, 1] as [number,number,number,number] } }}
            transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 240, damping: 24, mass: 1 }}
            style={{
              position:      'fixed',
              top:           88,
              left:          '50%',
              zIndex:        TOKENS.zIndex.zControls, // --z-controls: 20 — decorative hint, pointer-events none
              pointerEvents: 'none',
              width:         'calc(100vw - 48px)',
              maxWidth:      480,
              boxSizing:     'border-box',
            }}
          >
            <div style={{
              background:           'rgba(255,255,255,0.92)',
              backdropFilter:       'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border:               '1px solid var(--n-150)',
              borderRadius:         9999,
              padding:              'clamp(8px, 2vw, 10px) clamp(14px, 4vw, 20px)',
              fontFamily:           "'Inter', system-ui, sans-serif",
              fontSize:             13,
              fontWeight:           500,
              color:                'var(--n-900)',
              boxShadow:            '0 1px 3px rgba(26,25,23,.06)',
              pointerEvents:        'none',
              textAlign:            'center',
            }}>
              <span className="hero-pill-desktop">See what Ontario drivers are really paying — tap an envelope to explore</span>
              <span className="hero-pill-mobile">Tap an envelope to explore</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* First-visit onboarding overlay */}
      {mounted && (
        <OnboardingOverlay
          isVisible={showOnboarding}
          onDismiss={handleOnboardingDismiss}
          onSubmit={handleOnboardingSubmit}
        />
      )}

      {/* Map attribution — full-width footer bar, OSM + CARTO credit */}
      <div className={mcStyles.attributionBar}>
        {'© '}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
        >
          OpenStreetMap
        </a>
        {' contributors © '}
        <a
          href="https://carto.com/attributions"
          target="_blank"
          rel="noopener noreferrer"
        >
          CARTO
        </a>
      </div>
    </div>
  )
}
