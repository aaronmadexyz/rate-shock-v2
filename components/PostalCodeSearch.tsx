'use client'

import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import type { Map as LeafletMap } from 'leaflet'
import { getCentroid } from '@/lib/fsaCentroids'
import { getAreaLabel } from '@/lib/fsaData'
import { springs } from '@/lib/springs'
import { TOKENS } from '@/lib/tokens'
import { fetchFsaCount } from '@/lib/fetchFsaCount'

export interface PostalCodeSearchProps {
  mapRef:      React.MutableRefObject<LeafletMap | null>
  onCtaClick?: () => void
}

const SH_SM = TOKENS.shadows.shadowSm

const ONTARIO_PREFIXES = new Set(['K', 'L', 'M', 'N', 'P'])

type Status = 'idle' | 'loading' | 'valid' | 'pioneer' | 'invalid'

function SearchSvg({ active }: { active?: boolean }) {
  const color = active ? 'var(--p-500)' : 'var(--n-400)'
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" stroke={color} strokeWidth="1.3"/>
      <path d="M10.5 10.5L14 14" stroke={color} strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}


function PostalCodeSearch({ mapRef, onCtaClick }: PostalCodeSearchProps) {
  const [isExpanded,   setIsExpanded]   = useState(false)
  const [value,        setValue]        = useState('')
  const [status,       setStatus]       = useState<Status>('idle')
  const [isMobile,     setIsMobile]     = useState(false)
  const [windowWidth,  setWindowWidth]  = useState(375)
  const inputRef      = useRef<HTMLInputElement>(null)
  const pendingFsaRef = useRef<string>('')
  const prefersReduced = useReducedMotion()

  useEffect(() => {
    function update() {
      const mobile = window.innerWidth <= 680
      setIsMobile(mobile)
      setWindowWidth(window.innerWidth)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  function expand() {
    setIsExpanded(true)
    setTimeout(() => inputRef.current?.focus(), 40)
  }

  function collapse(clearValue = true) {
    setIsExpanded(false)
    if (clearValue) {
      setValue('')
      setStatus('idle')
      pendingFsaRef.current = ''
    }
  }

  async function handleInput(raw: string) {
    const v = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3)
    setValue(v)
    setStatus('idle')

    if (v.length !== 3) {
      pendingFsaRef.current = ''
      return
    }

    if (!ONTARIO_PREFIXES.has(v[0]!)) {
      pendingFsaRef.current = ''
      setStatus('invalid')
      return
    }

    const centroid = getCentroid(v)
    if (centroid) {
      mapRef.current?.flyTo(centroid, 13, { duration: 1.2, easeLinearity: 0.1 })
    }

    pendingFsaRef.current = v
    setStatus('loading')
    const count = await fetchFsaCount(v)

    if (pendingFsaRef.current !== v) return // stale

    const s: Status = count > 0 ? 'valid' : 'pioneer'
    setStatus(s)

    if (s === 'valid') {
      setTimeout(() => collapse(false), 400)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') collapse()
  }

  function handleBlur() {
    if (!value) collapse()
  }

  const neighbourhood = value.length === 3 ? getAreaLabel(value) : ''
  const showStatus    = isExpanded && status === 'invalid'
  const expandedWidth = isMobile ? windowWidth - 120 : 220

  // Content crossfade (Correction 3)
  const blurEnter = prefersReduced
    ? { opacity: 0 }
    : { opacity: 0, filter: 'blur(2px)' }
  const blurShow = prefersReduced
    ? { opacity: 1, transition: { duration: 0.1 } }
    : { opacity: 1, filter: 'blur(0px)', transition: { duration: 0.1 } }
  const blurExit = prefersReduced
    ? { opacity: 0, transition: { duration: 0.06 } }
    : { opacity: 0, filter: 'blur(2px)', transition: { duration: 0.06 } }

  // Layout spring (Correction 2: transformOrigin left center)
  const layoutTransition = prefersReduced
    ? { duration: 0 }
    : { type: 'spring' as const, ...springs.gentle }

  return (
    <div style={{ position: 'relative' }}>
      <style>{`
        .pcs-inp::placeholder { color: var(--n-300); }
        .pioneer-cta:hover { background: var(--p-700) !important; }
        .pioneer-cta:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--n-0), 0 0 0 4px var(--p-500); }
      `}</style>

      {/* Invalid FSA message — above the pill */}
      <AnimatePresence>
        {showStatus && (
          <motion.div
            key="invalid"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={prefersReduced ? { duration: 0 } : { duration: 0.12 }}
            style={{
              position:   'absolute',
              bottom:     'calc(100% + 8px)',
              left:       0,
              zIndex:     10,
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{
              display:      'block',
              fontFamily:   TOKENS.font,
              fontSize:     12,
              color:        'var(--neg-500)',
              background:   'var(--n-0)',
              border:       '1px solid var(--neg-200)',
              borderRadius: 'var(--r-md)',
              padding:      '8px 12px',
            }}>
              Try a valid Ontario postal code — like M5V or L6T
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pioneer CTA card — above the pill when FSA has zero submissions */}
      <AnimatePresence>
        {isExpanded && status === 'pioneer' && (
          <motion.div
            key="pioneer-card"
            role="status"
            aria-live="polite"
            aria-label={`No renewals found for ${value}. Be the first to share.`}
            initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={prefersReduced ? { opacity: 0 } : { opacity: 0, transition: { duration: 0.12 } }}
            transition={prefersReduced ? { duration: 0 } : { duration: 0.2, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
            style={{
              position:        'absolute',
              bottom:          'calc(100% + 8px)',
              left:            0,
              zIndex:          10,
              width:           260,
              transformOrigin: 'top center',
              background:      'var(--p-50)',
              border:          '1px solid var(--p-200)',
              borderRadius:    'var(--r-md)',
              padding:         '12px 16px',
              display:         'flex',
              flexDirection:   'column',
              gap:             8,
            }}
          >
            <span style={{
              fontFamily:    'var(--mono)',
              fontSize:      11,
              fontWeight:    500,
              letterSpacing: '0.04em',
              textTransform: 'uppercase' as const,
              color:         'var(--p-600)',
            }}>
              {value} · No renewals yet
            </span>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--n-900)', lineHeight: 1.5 }}>
              {neighbourhood
                ? `Be the first in ${neighbourhood} to share your renewal`
                : 'Be the first in this area to share your renewal'}
            </span>
            <span style={{ fontSize: 12, color: 'var(--n-500)', lineHeight: 1.5 }}>
              It takes 2 minutes and helps everyone nearby compare.
            </span>
            <motion.button
              type="button"
              className="pioneer-cta"
              onClick={onCtaClick}
              whileTap={prefersReduced ? undefined : { scale: 0.97 }}
              aria-label={`Share my renewal for ${neighbourhood || value}`}
              style={{
                width:        '100%',
                background:   'var(--p-600)',
                color:        'var(--n-0)',
                fontSize:     14,
                fontWeight:   500,
                borderRadius: 'var(--r-full)',
                padding:      '10px 0',
                border:       'none',
                cursor:       'pointer',
                transition:   'background .15s',
              }}
            >
              Share my renewal →
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanding pill — Correction 2: transformOrigin left center */}
      <motion.div
        animate={{ width: isExpanded ? expandedWidth : 40 }}
        transition={layoutTransition}
        style={{
          transformOrigin: 'left center',
          height:          40,
          borderRadius: TOKENS.radius.rFull,
          background:      'var(--n-0)',
          border:          isExpanded ? '1.5px solid var(--p-400)' : '1px solid var(--n-200)',
          boxShadow:       isExpanded ? '0 0 0 3px rgba(99,106,197,.12)' : SH_SM,
          overflow:        'hidden',
          display:         'flex',
          alignItems:      'center',
          cursor:          isExpanded ? 'default' : 'pointer',
          flexShrink:      0,
          transition:      'border-color .15s, box-shadow .15s',
        }}
        role={isExpanded ? undefined : 'button'}
        tabIndex={isExpanded ? undefined : 0}
        aria-label={isExpanded ? undefined : 'Search by postal area'}
        /* WCAG 2.1.1: keyboard users can expand search via Enter or Space ✓ */
        onKeyDown={(e) => {
          if (!isExpanded && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            expand()
          }
        }}
        onClick={() => { if (!isExpanded) expand() }}
      >
        {/* Correction 3: blur crossfade on state switch */}
        <AnimatePresence mode="wait" initial={false}>
          {isExpanded ? (
            <motion.div
              key="expanded"
              initial={blurEnter}
              animate={blurShow}
              exit={blurExit}
              style={{
                display:    'flex',
                alignItems: 'center',
                width:      '100%',
                height:     '100%',
              }}
            >
              <div style={{ padding: '0 8px 0 12px', display: 'flex', flexShrink: 0 }}>
                <SearchSvg active />
              </div>
              {/* Correction 1: input fades in after pill expands */}
              <motion.input
                ref={inputRef}
                className="pcs-inp"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.12, delay: 0.08 }}
                type="text"
                value={value}
                maxLength={3}
                placeholder="e.g. M5V"
                aria-label="Jump to FSA postal area"
                onChange={e => handleInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                style={{
                  fontFamily:  TOKENS.mono,
                  fontSize:    13,
                  color:       'var(--n-900)',
                  border:      'none',
                  outline:     'none',
                  background:  'transparent',
                  width:       '100%',
                  padding:     '0 12px 0 0',
                  letterSpacing: '0.04em',
                }}
              />
            </motion.div>
          ) : (
            <motion.div
              key="collapsed"
              initial={blurEnter}
              animate={blurShow}
              exit={blurExit}
              style={{
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                width:          '100%',
                height:         '100%',
              }}
            >
              <SearchSvg />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

export default React.memo(PostalCodeSearch)
