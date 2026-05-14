'use client'

import React, { useState, useEffect, useRef } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import { getCentroid } from '@/lib/fsaCentroids'
import { getAreaLabel } from '@/lib/fsaData'
import { supabase } from '@/lib/supabase'

export interface PostalCodeSearchProps {
  mapRef:      React.MutableRefObject<LeafletMap | null>
  onCtaClick?: () => void
}

const SH_SM = '0 1px 3px rgba(26,25,23,.06), 0 1px 2px rgba(26,25,23,.04)'

// Ontario FSA first-letter prefixes
const ONTARIO_PREFIXES = new Set(['K', 'L', 'M', 'N', 'P'])

type Status = 'idle' | 'loading' | 'valid' | 'pioneer' | 'invalid'

async function fetchFsaCount(fsa: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('submissions')
      .select('*', { count: 'exact', head: true })
      .ilike('fsa', fsa)
    if (error) return 0
    return count ?? 0
  } catch {
    return 0
  }
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M8 8l2.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
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
  const [value,          setValue]          = useState('')
  const [status,         setStatus]         = useState<Status>('idle')
  const [focused,        setFocused]        = useState(false)
  const [isMobile,       setIsMobile]       = useState(false)
  const [mobileExpanded, setMobileExpanded] = useState(false)
  const inputRef      = useRef<HTMLInputElement>(null)
  const pendingFsaRef = useRef<string>('')

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 680px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches)
      if (!e.matches) setMobileExpanded(false)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

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

    if (pendingFsaRef.current !== v) return // stale — user moved on

    const s: Status = count > 0 ? 'valid' : 'pioneer'
    setStatus(s)
    if (isMobile && s === 'valid') setMobileExpanded(false)
  }

  function toggleMobile() {
    if (mobileExpanded) {
      setMobileExpanded(false)
      setValue('')
      setStatus('idle')
    } else {
      setMobileExpanded(true)
      setTimeout(() => inputRef.current?.focus(), 40)
    }
  }

  // Border is red for invalid (even while focused); focus ring is always indigo
  const borderColor = status === 'invalid'
    ? '#D4503A'
    : focused ? '#636AC5' : '#D4D3CE'
  const shadow = focused ? '0 0 0 3px rgba(74,80,176,.12)' : SH_SM

  const sharedInput: React.CSSProperties = {
    fontFamily:    "'Inter', system-ui, sans-serif",
    fontSize:      14,
    fontWeight:    400,
    border:        `1px solid ${borderColor}`,
    borderRadius:  10,
    background:    '#FFFFFF',
    color:         '#2C2B27',
    outline:       'none',
    boxShadow:     shadow,
    transition:    'border-color .15s, box-shadow .15s',
    boxSizing:     'border-box' as const,
    textTransform: 'none' as const,
    letterSpacing: 'normal',
  }

  const iconWrap: React.CSSProperties = {
    position:    'absolute',
    left:        12,
    top:         '50%',
    transform:   'translateY(-50%)',
    pointerEvents: 'none',
    color:       '#B8B7B1',
    display:     'flex',
  }

  const neighbourhood = value.length === 3 ? getAreaLabel(value) : ''

  // ── Feedback messages ─────────────────────────────────────────────────────

  const PioneerMsg = () => (
    <div style={{
      marginTop:    6,
      background:   '#FEF6E8',
      border:       '1px solid #FACA6B',
      borderRadius: 8,
      padding:      '7px 10px',
      display:      'flex',
      alignItems:   'flex-start',
      gap:          6,
    }}>
      <ClockIcon />
      <span style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize:   12,
        color:      '#845A0C',
        lineHeight: 1.5,
      }}>
        No reports in {neighbourhood} yet.{' '}
        <button
          type="button"
          onClick={onCtaClick}
          style={{
            fontFamily:  'inherit',
            fontSize:    12,
            fontWeight:  600,
            color:       '#845A0C',
            background:  'none',
            border:      'none',
            padding:     0,
            cursor:      'pointer',
            textDecoration: 'underline',
            lineHeight:  'inherit',
          }}
        >
          Be the first.
        </button>
      </span>
    </div>
  )

  const InvalidMsg = () => (
    <span style={{
      display:    'block',
      marginTop:  4,
      fontFamily: "'Inter', system-ui, sans-serif",
      fontSize:   12,
      color:      '#B33C28',
    }}>
      Try a valid Ontario postal code — like M5V or L6T
    </span>
  )

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ position: 'relative' }}>
      {/* ::placeholder can't be set inline — inject once */}
      <style>{`
        .pcs-inp::placeholder {
          color: #B8B7B1;
          font-weight: 400;
          font-size: 14px;
          text-transform: none;
        }
      `}</style>

      {isMobile ? (
        <>
          {/* Expanded input panel — absolutely above the trigger */}
          {mobileExpanded && (
            <div style={{
              position:      'absolute',
              bottom:        'calc(100% + 8px)',
              left:          0,
              width:         240,
              display:       'flex',
              flexDirection: 'column',
            }}>
              {/* Message anchored above the input row */}
              {(status === 'pioneer' || status === 'invalid') && (
                <div style={{
                  position:   'absolute',
                  bottom:     'calc(100% + 8px)',
                  left:       0,
                  whiteSpace: 'nowrap',
                  zIndex:     10,
                }}>
                  {status === 'pioneer' && <PioneerMsg />}
                  {status === 'invalid' && <InvalidMsg />}
                </div>
              )}
              {/* Input row */}
              <div style={{ position: 'relative' }}>
                <span style={iconWrap}><SearchIcon /></span>
                <input
                  ref={inputRef}
                  className="pcs-inp"
                  type="text"
                  value={value}
                  maxLength={3}
                  placeholder="e.g. M5V"
                  aria-label="Jump to FSA postal area"
                  onChange={e => handleInput(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  style={{ ...sharedInput, width: '100%', padding: '10px 13px 10px 36px' }}
                />
              </div>
            </div>
          )}

          {/* Icon-only trigger */}
          <button
            type="button"
            onClick={toggleMobile}
            aria-label={mobileExpanded ? 'Close search' : 'Search by postal code'}
            style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              width:          31,
              height:         31,
              borderRadius:   9999,
              border:         mobileExpanded ? '1px solid #636AC5' : '1px solid #D4D3CE',
              background:     mobileExpanded ? '#EEEFFA' : '#FFFFFF',
              color:          mobileExpanded ? '#3A3F8F' : '#5E5D56',
              cursor:         'pointer',
              boxShadow:      SH_SM,
            }}
          >
            <SearchIcon />
          </button>
        </>
      ) : (
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
          {/* Message anchored above the input row */}
          {(status === 'pioneer' || status === 'invalid') && (
            <div style={{
              position:   'absolute',
              bottom:     'calc(100% + 8px)',
              left:       0,
              whiteSpace: 'nowrap',
              zIndex:     10,
            }}>
              {status === 'pioneer' && <PioneerMsg />}
              {status === 'invalid' && <InvalidMsg />}
            </div>
          )}
          {/* Input row */}
          <span style={iconWrap}><SearchIcon /></span>
          <input
            className="pcs-inp"
            type="text"
            value={value}
            maxLength={3}
            placeholder="e.g. M5V"
            aria-label="Jump to FSA postal area"
            onChange={e => handleInput(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={{
              ...sharedInput,
              height:     31,
              width:      focused ? 220 : 180,
              minWidth:   180,
              transition: 'border-color .15s, box-shadow .15s, width 200ms cubic-bezier(0.16, 1, 0.3, 1)',
              padding:    '0 13px 0 36px',
              display:    'block',
            }}
          />
        </div>
      )}
    </div>
  )
}

export default React.memo(PostalCodeSearch)
