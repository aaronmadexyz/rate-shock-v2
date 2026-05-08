'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { springs } from '@/lib/springs'
import { safeGetItem, safeSetItem } from '@/lib/storage'
import type { NavState } from '@/lib/types'

// ─── Types & constants ────────────────────────────────────────────────────────

type SubmissionState = NavState

const LS_KEY     = 'ratemap_submission_state'
const LS_PIONEER = 'ratemap_is_pioneer'
const LS_POSTED  = 'ratemap_posted_at'
const NAV_EVENT  = 'ratemap:nav-state'

// Shadow tokens — exact values from /lib/tokens.ts
const SH_SM = '0 1px 3px rgba(26,25,23,.06), 0 1px 2px rgba(26,25,23,.04)'
const SH_XS = '0 1px 2px rgba(26,25,23,.04)'

// Shared whileTap config — snappy spring per spec
const TAP = { scale: 0.97, transition: { type: 'spring', stiffness: 500, damping: 30, mass: 0.7 } } as const

// ─── Exported API ─────────────────────────────────────────────────────────────

export function setNavState(state: SubmissionState | string): void {
  if (typeof window === 'undefined') return
  const s = state as SubmissionState
  safeSetItem(LS_KEY, s)
  if (s === 'unverified') {
    safeSetItem(LS_POSTED, new Date().toISOString())
  }
  window.dispatchEvent(new CustomEvent(NAV_EVENT, { detail: s }))
}

// ─── Component ────────────────────────────────────────────────────────────────

interface NavProps {
  isPioneer?: boolean
  onCtaClick?: () => void
}

export default function Nav({ isPioneer: pioneeredProp = false, onCtaClick }: NavProps) {
  const [state,      setState]      = useState<SubmissionState>('new')
  const [isPioneer,  setIsPioneer]  = useState(false)
  const [daysLeft,   setDaysLeft]   = useState(30)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [shareToast, setShareToast] = useState(false)
  const [mounted,    setMounted]    = useState(false)

  const burgerRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)

  // ── Mount: read localStorage ──────────────────────────────────────────────
  useEffect(() => {
    const stored = safeGetItem(LS_KEY) as SubmissionState | null
    if (stored === 'new' || stored === 'unverified' || stored === 'verified') {
      setState(stored)
    }
    if (pioneeredProp) {
      setIsPioneer(true)
      safeSetItem(LS_PIONEER, 'true')
    } else if (safeGetItem(LS_PIONEER) === 'true') {
      setIsPioneer(true)
    }
    const postedAt = safeGetItem(LS_POSTED)
    if (postedAt) {
      const elapsed = Math.floor((Date.now() - new Date(postedAt).getTime()) / 86_400_000)
      setDaysLeft(Math.max(0, 30 - elapsed))
    }
    const onNavEvent = (e: Event) =>
      setState((e as CustomEvent<SubmissionState>).detail)
    window.addEventListener(NAV_EVENT, onNavEvent)
    setMounted(true)
    return () => window.removeEventListener(NAV_EVENT, onNavEvent)
  }, [pioneeredProp])

  // ── Close drawer on outside click ─────────────────────────────────────────
  useEffect(() => {
    if (!drawerOpen) return
    const handler = (e: MouseEvent) => {
      if (
        burgerRef.current?.contains(e.target as Node) ||
        drawerRef.current?.contains(e.target as Node)
      ) return
      setDrawerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [drawerOpen])

  // ── Close drawer when viewport widens past 680px ──────────────────────────
  useEffect(() => {
    const onResize = () => { if (window.innerWidth > 680) setDrawerOpen(false) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ── navigator.share → clipboard fallback ─────────────────────────────────
  const handleShare = useCallback(async () => {
    const url  = window.location.origin
    const text = 'I shared my renewal on RateShock – see what your neighbours are really paying.'
    try {
      if (navigator.share) {
        await navigator.share({ title: 'RateShock', text, url })
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`)
        setShareToast(true)
        setTimeout(() => setShareToast(false), 2200)
      }
    } catch {
      /* user cancelled */
    }
  }, [])

  // ─── Leading icon per state ───────────────────────────────────────────────
  const ctaIcon = () => {
    if (state === 'new') {
      return (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
          <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      )
    }
    if (state === 'unverified') {
      return (
        <span
          aria-hidden="true"
          style={{
            width: 7, height: 7, borderRadius: '50%',
            background: '#D49316', flexShrink: 0,
            animation: 'dotPulse 2.4s ease-in-out infinite',
          }}
        />
      )
    }
    return (
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d="M1.5 6.5l3.5 4L11 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CTA button
  // ─────────────────────────────────────────────────────────────────────────
  const renderCta = (drawer = false) => {
    // Base shape — pixel-exact match to .nav-cta / .drawer-cta in reference
    const base: React.CSSProperties = {
      fontFamily:    'inherit',
      fontWeight:    500,
      fontSize:      drawer ? 14 : 14,          // 14px — matches design system base button font-size
      lineHeight:    1,
      letterSpacing: '-0.01em',
      whiteSpace:    'nowrap',
      cursor:        'pointer',
      display:       'flex',
      alignItems:    'center',
      justifyContent: drawer ? 'center' : undefined,
      gap:           drawer ? 8 : 7,            // ref: drawer-cta gap:8, nav-cta gap:7
      width:         drawer ? '100%' : undefined,
      padding:       drawer ? '13px 24px' : '13px 24px',  // 13px 24px — identical height/weight on both
      borderRadius:  9999,                       // r-full — all buttons at every breakpoint
    }

    // ── State: new ─────────────────────────────────────────────────────────
    if (state === 'new') {
      return (
        <motion.button
          type="button"
          onClick={onCtaClick}
          style={{ ...base, backgroundColor: 'var(--tod-cta, #3A3F8F)', color: '#FFFFFF', boxShadow: SH_SM }}
          whileHover={{ backgroundColor: '#2D3170' }}       // ref: p-700 on hover
          whileTap={TAP}
        >
          {ctaIcon()}
          See how your renewal compares
        </motion.button>
      )
    }

    // ── State: unverified ──────────────────────────────────────────────────
    if (state === 'unverified') {
      const isUrgent = daysLeft <= 7 && daysLeft > 0
      return (
        <motion.button
          type="button"
          onClick={onCtaClick}
          style={{
            ...base,
            // ref: nav-cta unverified = n-0 (#FFF); drawer-cta unverified = n-50 (#F5F4F1)
            backgroundColor: drawer ? '#F5F4F1' : '#FFFFFF',
            color:           '#2C2B27',                     // ref: n-800
            borderWidth:     1,
            borderStyle:     'solid',
            borderColor:     '#D4D3CE',                     // ref: n-200 solid token
            boxShadow:       SH_SM,
          }}
          whileHover={{
            backgroundColor: drawer ? '#EEEDEA' : '#FAFAF8',  // ref: n-25 on hover
            borderColor:     '#B8B7B1',                        // ref: n-300 on hover
          }}
          whileTap={TAP}
        >
          {ctaIcon()}
          Verify your post
          {daysLeft > 0 && (
            <span
              style={{
                fontFamily:      "'IBM Plex Mono', monospace",
                fontSize:        10,                            // ref: 10px
                fontWeight:      500,
                letterSpacing:   '0.02em',                     // ref: .02em
                lineHeight:      1.4,
                color:           isUrgent ? '#7A4E08' : '#92600A',
                backgroundColor: isUrgent ? 'rgba(212,147,22,.22)' : 'rgba(212,147,22,.14)',
                padding:         '2px 7px',                    // ref: cta-urgency pill
                borderRadius:    999,
                whiteSpace:      'nowrap',
                flexShrink:      0,
              }}
            >
              {daysLeft}d
            </span>
          )}
        </motion.button>
      )
    }

    // ── State: verified ────────────────────────────────────────────────────
    return (
      <motion.button
        type="button"
        onClick={onCtaClick}
        style={{
          ...base,
          backgroundColor: '#EDF7F0',
          color:           '#1F6132',
          border:          '1px solid rgba(58,155,85,.2)',    // ref: .2 opacity
          boxShadow:       SH_SM,
        }}
        whileHover={{ backgroundColor: '#e0f2e6' }}           // ref: exact hover value
        whileTap={TAP}
      >
        {ctaIcon()}
        Post another renewal
      </motion.button>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Pioneer share nudge
  // ─────────────────────────────────────────────────────────────────────────
  const renderPioneerNudge = (drawer = false) => {
    if (!isPioneer || state === 'new') return null

    // SVG check icon — matches reference exactly
    const checkIcon = (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d="M1 6l3.5 3.5L11 1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )

    if (drawer) {
      return (
        <>
          <motion.button
            type="button"
            onClick={() => { void handleShare(); setDrawerOpen(false) }}
            style={{
              fontFamily:      'inherit',
              fontSize:        15,
              fontWeight:      500,
              color:           '#43423D',
              backgroundColor: 'transparent',
              border:          'none',
              cursor:          'pointer',
              padding:         '12px 12px',
              borderRadius:    10,
              textAlign:       'left',
              display:         'flex',
              alignItems:      'center',
              gap:             8,
              letterSpacing:   '-0.01em',
              width:           '100%',
            }}
            whileHover={{ backgroundColor: '#F5F4F1' }}
            whileTap={TAP}
          >
            {checkIcon}
            Share with neighbours
          </motion.button>
          <div style={{ height: 1, background: '#EEEDEA', margin: '4px 0' }} />
        </>
      )
    }

    // Desktop — 3px nudge-sep dot between text segments
    const sep = (
      <span
        aria-hidden="true"
        style={{
          width: 3, height: 3,
          borderRadius: '50%',
          background: '#B8B7B1',  // ref: n-300
          flexShrink: 0,
          display: 'inline-block',
        }}
      />
    )

    return (
      <div style={{ position: 'relative' }}>
        <motion.button
          type="button"
          onClick={() => void handleShare()}
          style={{
            fontFamily:      'inherit',
            fontSize:        13,
            fontWeight:      500,
            color:           '#7C7B72',   // ref: n-500
            backgroundColor: 'transparent',
            border:          'none',
            cursor:          'pointer',
            padding:         '6px 10px',  // ref: 6px 10px
            borderRadius:    8,           // ref: 8px (not full pill)
            whiteSpace:      'nowrap',
            display:         'flex',
            alignItems:      'center',
            gap:             6,
          }}
          whileHover={{ color: '#43423D', backgroundColor: 'rgba(26,25,23,.05)' }}
          whileTap={TAP}
        >
          {checkIcon}
          You&apos;re on the map
          {sep}
          Share with neighbours
        </motion.button>

        {shareToast && (
          <div
            role="status"
            aria-live="polite"
            style={{
              position:      'absolute',
              top:           'calc(100% + 6px)',
              left:          '50%',
              transform:     'translateX(-50%)',
              fontFamily:    "'IBM Plex Mono', monospace",
              fontSize:      11,
              background:    '#1A1917',
              color:         '#FFFFFF',
              padding:       '5px 14px',
              borderRadius:  999,
              pointerEvents: 'none',
              whiteSpace:    'nowrap',
              zIndex:        10,
            }}
          >
            Link copied
          </div>
        )}
      </div>
    )
  }

  // ─── Drawer status note ───────────────────────────────────────────────────
  const drawerStatusNote = state !== 'new' ? (
    <p
      style={{
        fontSize:   12,
        color:      state === 'unverified' && daysLeft <= 7 && daysLeft > 0 ? '#845A0C' : '#9A998F',
        fontWeight: state === 'unverified' && daysLeft <= 7 && daysLeft > 0 ? 500 : 400,
        textAlign:  'center',
        padding:    '10px 4px 4px',
        lineHeight: 1.5,
        margin:     0,
      }}
    >
      {state === 'unverified'
        ? (daysLeft <= 7 && daysLeft > 0
            ? `Your renewal window closes in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Verify before it lapses.`
            : 'Your renewal is on the map — verify it to make it count more.')
        : "You're verified and on the map."}
    </p>
  ) : null

  // ─── Hamburger bar base style ─────────────────────────────────────────────
  const spanBase: React.CSSProperties = {
    display:         'block',
    width:           14,
    height:          1.5,
    background:      '#1A1917',
    borderRadius:    2,
    transformOrigin: 'center',
    transition:      'transform .25s cubic-bezier(.16,1,.3,1), opacity .2s ease',
  }

  // ─── JSX ─────────────────────────────────────────────────────────────────

  return (
    <nav
      style={{
        position:      'fixed',
        top: 0, left: 0, right: 0,
        zIndex:        100,
        background:    'transparent',
        pointerEvents: 'none',
      }}
    >
      {/* ── Main row ────────────────────────────────────────────────────────── */}
      <div
        style={{
          width:          '100%',
          padding:        '16px 24px',    // ref: 16px 24px
          display:        'flex',
          alignItems:     'center',       // ref: center (not flex-start)
          justifyContent: 'space-between',
          gap:            16,
          pointerEvents:  'none',
        }}
      >

        {/* ── Brand — left ─────────────────────────────────────────────────── */}
        <a
          href="/"
          style={{
            pointerEvents:  'all',
            textDecoration: 'none',
            display:        'flex',
            flexDirection:  'column',
            gap:            3,
            flexShrink:     0,
          }}
        >
          <span
            style={{
              fontFamily:           "'Inter', system-ui, sans-serif",
              fontVariationSettings: "'opsz' 32",
              fontSize:             18,
              fontWeight:           600,
              color:                '#1A1917',
              lineHeight:           1.1,
              letterSpacing:        '-0.03em',  // ref: -0.03em
            }}
          >
            RateShock
          </span>

          <span
            className="max-[680px]:hidden"
            style={{
              fontSize:      12,
              fontWeight:    400,
              color:         '#9A998F',
              letterSpacing: '0.005em',   // ref: 0.005em
              lineHeight:    1,
            }}
          >
            See what your neighbours are really paying.
          </span>
        </a>

        {/* ── Desktop actions — right ──────────────────────────────────────── */}
        {/* gap:16 matches reference's nav-inner gap between nudge and CTA */}
        <div
          className="flex items-center max-[680px]:hidden"
          style={{
            pointerEvents: 'all',
            gap:           16,            // ref: all nav-inner siblings use gap:16
            flexShrink:    0,
          }}
        >
          {mounted ? renderPioneerNudge() : null}
          {mounted
            ? renderCta()
            : <div style={{ width: 220, height: 38, borderRadius: 9999, background: '#E2E1DD', opacity: 0.5 }} />
          }
        </div>

        {/* ── Hamburger — mobile only ──────────────────────────────────────── */}
        <motion.button
          ref={burgerRef}
          type="button"
          className="hidden max-[680px]:flex flex-col items-center justify-center"
          onClick={() => setDrawerOpen(o => !o)}
          aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={drawerOpen}
          style={{
            pointerEvents:   'all',
            width:           36,
            height:          36,
            gap:             5,
            flexShrink:      0,
            borderRadius:    999,
            border:          '1px solid #D4D3CE',  // ref: n-200 solid token
            backgroundColor: '#FFFFFF',
            cursor:          'pointer',
            boxShadow:       SH_XS,                // ref: sh-xs
            padding:         0,
          }}
          whileHover={{ backgroundColor: '#FAFAF8' }}   // ref: n-25 on hover
          whileTap={TAP}
        >
          <span style={{ ...spanBase, transform: drawerOpen ? 'translateY(6.5px) rotate(45deg)'  : 'none' }} />
          <span style={{ ...spanBase, transform: drawerOpen ? 'scaleX(0)' : 'none', opacity: drawerOpen ? 0 : 1 }} />
          <span style={{ ...spanBase, transform: drawerOpen ? 'translateY(-6.5px) rotate(-45deg)' : 'none' }} />
        </motion.button>

      </div>{/* /nav-inner */}

      {/* ── Mobile drawer — Framer Motion ────────────────────────────────────── */}
      <AnimatePresence>
        {drawerOpen && (
          <motion.div
            ref={drawerRef}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', ...springs.gentle }}
            style={{
              overflow:        'hidden',
              pointerEvents:   'all',
              margin:          '0 16px',              // ref: 16px
              backgroundColor: '#FFFFFF',
              border:          '1px solid #D4D3CE',   // ref: n-200 solid token
              borderRadius:    14,
              boxShadow:       '0 4px 12px rgba(26,25,23,.06), 0 1px 3px rgba(26,25,23,.04)',
            }}
          >
            <div
              style={{
                display:       'flex',
                flexDirection: 'column',
                gap:           2,
                padding:       12,                    // ref: drawer-inner padding:12px
              }}
            >
              {drawerStatusNote}
              {renderPioneerNudge(true)}
              {renderCta(true)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </nav>
  )
}
