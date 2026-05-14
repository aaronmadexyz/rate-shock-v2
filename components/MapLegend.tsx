'use client'

import { useState, useEffect } from 'react'

const ITEMS = [
  { w: 26, h: 18, label: 'Lower premium' },
  { w: 40, h: 28, label: 'Average premium' },
  { w: 54, h: 38, label: 'Higher premium' },
]

function EnvelopeSvg({ w, h }: { w: number; h: number }) {
  return (
    <svg width={w} height={h} viewBox="0 0 40 28" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="0.5" y="0.5" width="39" height="27" rx="2.5" fill="#F0EDE8" stroke="#D4D3CE" strokeWidth="0.8"/>
      <polygon points="0,0 40,0 20,15" fill="#E8E4DD" opacity="0.8"/>
      <circle cx="20" cy="6.5" r="4" fill="#D4D3CE"/>
    </svg>
  )
}

export default function MapLegend() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 680px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return (
    <div style={{
      position:     'fixed',
      bottom:       isMobile ? 20 : 28,
      right:        isMobile ? 68 : 80,
      zIndex:       20,
      background:   '#FFFFFF',
      border:       '1px solid #E2E1DD',
      borderRadius: 10,
      padding:      '10px 12px',
      boxShadow:    '0 1px 3px rgba(26,25,23,.06), 0 1px 2px rgba(26,25,23,.04)',
    }}>
      <div style={{
        fontFamily:    "'IBM Plex Mono', monospace",
        fontSize:      9,
        fontWeight:    500,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color:         '#9A998F',
        marginBottom:  8,
      }}>
        Envelope size
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {ITEMS.map(({ w, h, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <EnvelopeSvg w={w} h={h} />
            <span style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize:   11,
              color:      '#5E5D56',
              lineHeight: 1,
            }}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
