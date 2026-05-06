'use client'

import { useState, useEffect, useRef } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import { getCentroid } from '@/lib/fsaCentroids'

export interface PostalCodeSearchProps {
  mapRef: React.MutableRefObject<LeafletMap | null>
}

const SH_SM = '0 1px 3px rgba(26,25,23,.06), 0 1px 2px rgba(26,25,23,.04)'

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M8 8l2.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

export default function PostalCodeSearch({ mapRef }: PostalCodeSearchProps) {
  const [value,          setValue]          = useState('')
  const [status,         setStatus]         = useState<'idle' | 'notfound'>('idle')
  const [focused,        setFocused]        = useState(false)
  const [isMobile,       setIsMobile]       = useState(false)
  const [mobileExpanded, setMobileExpanded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

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

  function handleInput(raw: string) {
    const v = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3)
    setValue(v)
    setStatus('idle')
    if (v.length === 3) {
      const centroid = getCentroid(v)
      if (centroid) {
        mapRef.current?.flyTo(centroid, 13, { duration: 1.2, easeLinearity: 0.1 })
        if (isMobile) setMobileExpanded(false)
      } else {
        setStatus('notfound')
      }
    }
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

  const borderColor = focused ? '#636AC5' : '#D4D3CE'
  const shadow      = focused ? '0 0 0 3px rgba(74,80,176,.12)' : SH_SM

  const sharedInput: React.CSSProperties = {
    fontFamily:      "'Inter', system-ui, sans-serif",
    fontSize:        14,
    fontWeight:      400,
    border:          `1px solid ${borderColor}`,
    borderRadius:    10,
    background:      '#FFFFFF',
    color:           '#2C2B27',
    outline:         'none',
    boxShadow:       shadow,
    transition:      'border-color .15s, box-shadow .15s',
    boxSizing:       'border-box' as const,
    textTransform:   'none' as const,
    letterSpacing:   'normal',
  }

  const iconWrap: React.CSSProperties = {
    position:        'absolute',
    left:            12,
    top:             '50%',
    transform:       'translateY(-50%)',
    pointerEvents:   'none',
    color:           '#B8B7B1',
    display:         'flex',
  }

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
              position: 'absolute',
              bottom:   'calc(100% + 8px)',
              left:     0,
              width:    240,
            }}>
              <div style={{ position: 'relative' }}>
                <span style={iconWrap}><SearchIcon /></span>
                <input
                  ref={inputRef}
                  className="pcs-inp"
                  type="text"
                  value={value}
                  maxLength={3}
                  placeholder="Your neighbourhood"
                  aria-label="Jump to FSA postal area"
                  onChange={e => handleInput(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  style={{ ...sharedInput, width: '100%', padding: '10px 13px 10px 36px' }}
                />
              </div>
              {status === 'notfound' && (
                <span style={{
                  display:    'block',
                  marginTop:  4,
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize:   11,
                  fontWeight: 500,
                  color:      '#D4503A',
                }}>
                  Area not found
                </span>
              )}
            </div>
          )}

          {/* Icon-only trigger */}
          <button
            type="button"
            onClick={toggleMobile}
            aria-label={mobileExpanded ? 'Close search' : 'Search by postal code'}
            style={{
              display:         'flex',
              alignItems:      'center',
              justifyContent:  'center',
              width:           31,
              height:          31,
              borderRadius:    9999,
              border:          mobileExpanded ? '1px solid #636AC5' : '1px solid #D4D3CE',
              background:      mobileExpanded ? '#EEEFFA' : '#FFFFFF',
              color:           mobileExpanded ? '#3A3F8F' : '#5E5D56',
              cursor:          'pointer',
              boxShadow:       SH_SM,
            }}
          >
            <SearchIcon />
          </button>
        </>
      ) : (
        <>
          {/* Desktop: compact expanding input */}
          <span style={iconWrap}><SearchIcon /></span>
          <input
            className="pcs-inp"
            type="text"
            value={value}
            maxLength={3}
            placeholder="Your neighbourhood"
            aria-label="Jump to FSA postal area"
            onChange={e => handleInput(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={{
              ...sharedInput,
              height:     31,   // matches filter pill height (8px pad + 13px font + 8px pad + 2px border)
              width:      focused ? 220 : 180,
              minWidth:   180,
              transition: 'border-color .15s, box-shadow .15s, width 200ms cubic-bezier(0.16, 1, 0.3, 1)',
              padding:    '0 13px 0 36px',
              display:    'block',
            }}
          />
          {status === 'notfound' && (
            <span style={{
              position:   'absolute',
              top:        'calc(100% + 4px)',
              left:       0,
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize:   11,
              fontWeight: 500,
              color:      '#D4503A',
              background: '#FFFFFF',
              padding:    '3px 10px',
              borderRadius: 999,
              boxShadow:  SH_SM,
              whiteSpace: 'nowrap',
            }}>
              Area not found
            </span>
          )}
        </>
      )}
    </div>
  )
}
