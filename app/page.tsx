'use client'

// Prevent static prerender — page depends on client-side Supabase and Leaflet
export const dynamic = 'force-dynamic'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { getTimeOfDay, timeOfDayTokens } from '@/lib/timeOfDay'
import lazyLoad from 'next/dynamic'
import type { Map as LeafletMap } from 'leaflet'
import Nav from '@/components/Nav'
import MapControls from '@/components/MapControls'
import FilterSheet, { countFilters } from '@/components/FilterSheet'
import type { FilterState } from '@/lib/types'
import ShareRenewalModal from '@/components/ShareRenewalModal'
import FeatureRequestButton from '@/components/FeatureRequestButton'
import { MapErrorBoundary } from '@/components/MapErrorBoundary'
import type { Submission, MapViewHandle, UserProfile } from '@/lib/types'
import type { CohortResult } from '@/lib/cohortMatch'
import { safeGetItem, safeSetItem } from '@/lib/storage'

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
  const [modalOpen,    setModalOpen]    = useState(false)
  const [filterOpen,   setFilterOpen]   = useState(false)
  const [filters,      setFilters]      = useState<FilterState>(DEFAULT_FILTERS)
  const [likeMeMode,   setLikeMeMode]   = useState(false)
  const [userProfile,  setUserProfile]  = useState<UserProfile | null>(null)
  const [hasSubmission, setHasSubmission] = useState(false)
  const [cohortResult, setCohortResult] = useState<CohortResult | null>(null)

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
      />

      <FeatureRequestButton />
    </>
  )
}
