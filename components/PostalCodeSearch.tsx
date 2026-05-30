'use client'

import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import type { Map as LeafletMap } from 'leaflet'
import { getCentroid } from '@/lib/fsaCentroids'
import { getAreaLabel } from '@/lib/fsaData'
import { springs } from '@/lib/springs'
import { fetchFsaCount } from '@/lib/fetchFsaCount'

export interface PostalCodeSearchProps {
  mapRef:      React.MutableRefObject<LeafletMap | null>
  onCtaClick?: () => void
}

const SH_SM = '0 1px 3px rgba(26,25,23,.06), 0 1px 2px rgba(26,25,23,.04)'

const ONTARIO_PREFIXES = new Set(['K', 'L', 'M', 'N', 'P'])

type Status = 'idle' | 'loading' | 'valid' | 'pioneer' | 'invalid'

function SearchSvg({ active }: { active?: boolean }) {
  const color = active ? '#4A50B0' : 'var(--n-400)'
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" stroke={color} strokeWidth="1.3"/>
      <path d="M10.5 10.5L14 14" stroke={color} strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="6.5" cy="6.5" r="5.5" stroke="#D49316" strokeWidth="1.1"/>
      <path d="M6.5 4v2.5l1.5 1.5" stroke="#D49316" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
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

    if (!ONTARIO_PREFIXES.has(v[0])) {
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
  const showStatus    = isExpanded && (status === 'pioneer' || status === 'invalid')
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
      <style>{`.pcs-inp::placeholder { color: var(--n-300); }`}</style>

      {/* Status messages — above the pill */}
      <AnimatePresence>
        {showStatus && (
          <motion.div
            key={status}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={prefersReduced ? { duration: 0 } : { duration: 0.12 }}
            style={{
              position:  'absolute',
              bottom:    'calc(100% + 8px)',
              left:      0,
              zIndex:    10, // z-markers
              whiteSpace: 'nowrap',
            }}
          >
            {status === 'pioneer' && (
              <div style={{
                background:   'var(--p-50)',
                border:       '1px solid var(--p-200)',
                borderRadius: 'var(--r-md)',
                padding:      '8px 12px',
                display:      'flex',
                alignItems:   'flex-start',
                gap:          8,
              }}>
                <ClockIcon />
                <span style={{
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize:   12,
                  color:      'var(--p-600)',
                  lineHeight: 1.5,
                }}>
                  No reports in {neighbourhood} yet.{' '}
                  <button
                    type="button"
                    onClick={onCtaClick}
                    style={{
                      fontFamily:     'inherit',
                      fontSize:       12,
                      fontWeight:     600,
                      color:          'var(--p-600)',
                      background:     'none',
                      border:         'none',
                      padding:        0,
                      cursor:         'pointer',
                      textDecoration: 'underline',
                      lineHeight:     'inherit',
                    }}
                  >
                    Be the first.
                  </button>
                </span>
              </div>
            )}
            {status === 'invalid' && (
              <span style={{
                display:    'block',
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize:   12,
                color:      'var(--neg-500)',
                background: 'var(--n-0)',
                border:     '1px solid var(--neg-200)',
                borderRadius: 'var(--r-md)',
                padding:    '8px 12px',
              }}>
                Try a valid Ontario postal code — like M5V or L6T
              </span>
            )}
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
          borderRadius:    9999,
          background:      'var(--n-0)',
          border:          isExpanded ? '1.5px solid var(--p-400)' : '1px solid var(--n-200)',
          boxShadow:       isExpanded ? '0 0 0 3px rgba(74,80,176,.09)' : SH_SM,
          overflow:        'hidden',
          display:         'flex',
          alignItems:      'center',
          cursor:          isExpanded ? 'default' : 'pointer',
          flexShrink:      0,
          transition:      'border-color .15s, box-shadow .15s',
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
                  fontFamily:  "'IBM Plex Mono', monospace",
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
