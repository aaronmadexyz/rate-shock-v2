'use client'

// Prevent static prerender — page depends on client-side Supabase and Leaflet
export const dynamic = 'force-dynamic'

import { useState, useRef, useCallback } from 'react'
import lazyLoad from 'next/dynamic'
import type { Map as LeafletMap } from 'leaflet'
import Nav from '@/components/Nav'
import MapControls from '@/components/MapControls'
import FilterSheet, { FilterState, countFilters } from '@/components/FilterSheet'
import ShareRenewalModal from '@/components/ShareRenewalModal'
import { MapErrorBoundary } from '@/components/MapErrorBoundary'
import type { Submission, MapViewHandle } from '@/lib/types'

// Leaflet requires browser APIs — skip SSR entirely
const MapView = lazyLoad(() => import('@/components/MapView'), { ssr: false })

const DEFAULT_FILTERS: FilterState = {
  types: { auto: true, home: true },
  provs: [],
  rMin: 0,
  rMax: 50,
  verified: false,
}

export default function Page() {
  const [modalOpen,  setModalOpen]  = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filters,    setFilters]    = useState<FilterState>(DEFAULT_FILTERS)

  // Stable ref to MapView's handle — allows prepending without a re-fetch
  const mapHandle = useRef<MapViewHandle | null>(null)
  const onMapReady = useCallback((h: MapViewHandle) => { mapHandle.current = h }, [])

  // Leaflet map instance — forwarded to MapControls for PostalCodeSearch flyTo
  const leafletMapRef = useRef<LeafletMap | null>(null)
  const onLeafletReady = useCallback((m: LeafletMap) => { leafletMapRef.current = m }, [])

  const activeFilterCount = countFilters(filters)

  function handleSubmitted(sub: Submission) {
    mapHandle.current?.prependSubmission(sub)
  }

  function handleVerify() {
    setModalOpen(false)
  }

  return (
    <>
      {/* Map — fills the viewport at z-index 0 */}
      <MapErrorBoundary>
        <MapView filters={filters} onReady={onMapReady} onLeafletReady={onLeafletReady} />
      </MapErrorBoundary>

      {/* Fixed nav — above the map via z-index in globals.css (--z-nav: 100) */}
      <Nav onCtaClick={() => setModalOpen(true)} />

      {/* Filter button — bottom-left */}
      <MapControls
        activeCount={activeFilterCount}
        onClick={() => setFilterOpen(true)}
        mapRef={leafletMapRef}
      />

      {/* Filter sheet */}
      <FilterSheet
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        onChange={setFilters}
      />

      {/* Renewal modal */}
      <ShareRenewalModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onVerify={handleVerify}
        onSubmitted={handleSubmitted}
      />
    </>
  )
}
