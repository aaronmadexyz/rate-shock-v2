'use client'

import { motion } from 'framer-motion'
import type { Map as LeafletMap } from 'leaflet'
import { springs } from '@/lib/springs'
import PostalCodeSearch from '@/components/PostalCodeSearch'

// ─── Constants ────────────────────────────────────────────────────────────────

const SH_SM = '0 1px 3px rgba(26,25,23,.06), 0 1px 2px rgba(26,25,23,.04)'

const TAP = {
  scale: 0.97,
  transition: { type: 'spring' as const, ...springs.snappy },
} as const

// ─── Props ────────────────────────────────────────────────────────────────────

interface MapControlsProps {
  activeCount: number
  onClick:     () => void
  onCtaClick:  () => void
  mapRef:      React.MutableRefObject<LeafletMap | null>
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MapControls({ activeCount, onClick, onCtaClick, mapRef }: MapControlsProps) {
  const isActive = activeCount > 0

  return (
    <>
      {/* Responsive position — bottom/left shift on mobile */}
      <style>{`
        @media (max-width: 680px) {
          .mc-wrap { bottom: 20px !important; left: 16px !important; }
        }
      `}</style>

      <div
        className="mc-wrap"
        style={{
          position:   'fixed',
          bottom:     28,
          left:       24,
          zIndex:     99,
          display:    'flex',
          alignItems: 'center',
          gap:        8,
        }}
      >
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
          whileHover={isActive ? {} : {
            backgroundColor: '#FAFAF8',
            borderColor:     '#B8B7B1',
          }}
          whileTap={TAP}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 13 13"
            fill="none"
            aria-hidden="true"
            style={{ flexShrink: 0 }}
          >
            <path
              d="M1 2.5h11M3.5 6.5h6M6 10.5h1"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>

          Filter

          {isActive && (
            <span
              style={{
                fontFamily:      "'IBM Plex Mono', monospace",
                fontSize:        10,
                fontWeight:      500,
                lineHeight:      1.4,
                backgroundColor: '#3A3F8F',
                color:           '#FFFFFF',
                padding:         '2px 6px',
                borderRadius:    999,
              }}
            >
              {activeCount}
            </span>
          )}
        </motion.button>

        {/* Postal code search — sits to the right of the filter pill */}
        <PostalCodeSearch mapRef={mapRef} onCtaClick={onCtaClick} />
      </div>
    </>
  )
}
