'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { springs } from '@/lib/springs'
import { TOKENS } from '@/lib/tokens'

const SH_MD = TOKENS.shadows.shadowMd
const SH_SM = TOKENS.shadows.shadowSm

const ITEMS = [
  { w: 26, h: 18, label: 'Lower premium' },
  { w: 40, h: 28, label: 'Average premium' },
  { w: 54, h: 38, label: 'Higher premium' },
]

function EnvelopeSvg({ w, h }: { w: number; h: number }) {
  return (
    <svg width={w} height={h} viewBox="0 0 40 28" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="0.5" y="0.5" width="39" height="27" rx="2.5" fill={TOKENS.colors.paperBody} stroke={TOKENS.colors.n200} strokeWidth="0.8"/>
      <polygon points="0,0 40,0 20,15" fill={TOKENS.colors.n150} opacity="0.8"/>
      <circle cx="20" cy="6.5" r="4" fill={TOKENS.colors.n200}/>
    </svg>
  )
}

export default function LegendButton() {
  const [show, setShow]     = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const prefersReduced      = useReducedMotion()
  const legendEverShown     = useRef(false)
  const btnRef              = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 680px)')
    setIsMobile(mq.matches)
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])

  // Close on outside tap (mobile)
  useEffect(() => {
    if (!isMobile || !show) return
    function onDoc(e: PointerEvent) {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setShow(false)
      }
    }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [isMobile, show])

  // Correction 5: variant changes after first open
  function tooltipVariants() {
    if (prefersReduced) {
      return {
        hidden:  { opacity: 0 },
        visible: { opacity: 1, transition: { duration: 0.15 } },
        exit:    { opacity: 0, transition: { duration: 0.15 } },
      }
    }
    if (legendEverShown.current) {
      return {
        hidden:  { opacity: 0 },
        visible: { opacity: 1, transition: { duration: 0 } },
        exit:    { opacity: 0, transition: { duration: 0 } },
      }
    }
    return {
      hidden:  { opacity: 0, scale: 0.97, y: 4 },
      visible: {
        opacity: 1, scale: 1, y: 0,
        transition: { type: 'spring' as const, ...springs.snappy },
      },
      exit:    { opacity: 0, y: 4, transition: { duration: 0.08 } },
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        type="button"
        aria-label="Legend"
        aria-expanded={show}
        onClick={() => { if (isMobile) setShow(v => !v) }}
        onMouseEnter={() => { if (!isMobile) setShow(true) }}
        onMouseLeave={() => { if (!isMobile) setShow(false) }}
        style={{
          width:          40,
          height:         40,
          borderRadius: TOKENS.radius.rFull,
          background:     'var(--n-0)',
          border:         '1px solid var(--n-200)',
          boxShadow:      SH_SM,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          cursor:         'pointer',
          flexShrink:     0,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" stroke={TOKENS.colors.n400} strokeWidth="1.3"/>
          <path d="M8 7.5v4M8 5.5v.01" stroke={TOKENS.colors.n400} strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      </button>

      <AnimatePresence>
        {show && (
          <motion.div
            key="legend-tooltip"
            variants={tooltipVariants()}
            initial="hidden"
            animate="visible"
            exit="exit"
            onAnimationComplete={() => { if (show) legendEverShown.current = true }}
            style={{
              position:        'absolute',
              bottom:          'calc(100% + 8px)',
              right:           0,
              transformOrigin: 'bottom right',
              pointerEvents:   'none',
              whiteSpace:      'nowrap',
              background:      'var(--n-0)',
              border:          '1px solid var(--n-150)',
              borderRadius:    'var(--r-md)',
              padding:         '12px 14px',
              boxShadow:       SH_MD,
              zIndex:          TOKENS.zIndex.zTooltip, // --z-tooltip: 300
            }}
          >
            <div style={{
              fontFamily:    TOKENS.mono,
              fontSize:      11,
              fontWeight:    500,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color:         'var(--n-400)',
              marginBottom:  8,
            }}>
              Envelope size
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ITEMS.map(({ w, h, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <EnvelopeSvg w={w} h={h} />
                  <span style={{
                    fontFamily: TOKENS.font,
                    fontSize:   11,
                    color:      'var(--n-600)',
                    lineHeight: 1,
                  }}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
