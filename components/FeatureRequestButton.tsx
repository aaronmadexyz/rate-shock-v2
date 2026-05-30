'use client'

import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { springs } from '@/lib/springs'
import { TOKENS } from '@/lib/tokens'
import { supabase } from '@/lib/supabase'
import { safeGetItem } from '@/lib/storage'

// ─── Constants ────────────────────────────────────────────────────────────────

const SH_SM = TOKENS.shadows.shadowSm
const CHAR_LIMIT = 280

const TOP_REQUESTS = [
  'Renewal history over time',
  'Provider rating breakdown',
  'Email alerts for my area',
]

type UIState = 'idle' | 'loading' | 'success' | 'error'

// ─── Icons ────────────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3.5 9l4 4L14.5 5" stroke="#1F6132" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

interface FeatureRequestButtonProps {
  isOpen:  boolean
  onClose: () => void
}

function FeatureRequestButton({ isOpen: open, onClose }: FeatureRequestButtonProps) {
  const [message,  setMessage]  = useState('')
  const [uiState,  setUiState]  = useState<UIState>('idle')
  const [isMobile, setIsMobile] = useState(false)
  const prefersReduced = useReducedMotion()
  const closeTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSubmitRef  = useRef<number>(0)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 680px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Auto-close after success
  useEffect(() => {
    if (uiState === 'success') {
      closeTimerRef.current = setTimeout(() => {
        onClose()
        // Reset after exit animation completes
        setTimeout(() => {
          setUiState('idle')
          setMessage('')
        }, 200)
      }, 2800)
    }
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [uiState, onClose])

  function handleClose() {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    onClose()
    setTimeout(() => {
      setUiState('idle')
      setMessage('')
    }, 200)
  }

  async function handleSubmit() {
    const trimmed = message.trim()
    if (!trimmed || trimmed.length > CHAR_LIMIT) return

    // Debounce: ignore rapid double-submits within 5 seconds
    const now = Date.now()
    if (now - lastSubmitRef.current < 5000) return
    lastSubmitRef.current = now

    setUiState('loading')
    try {
      const { error } = await supabase
        .from('feature_requests')
        .insert({
          message:  trimmed,
          fsa:      safeGetItem('ratemap_last_fsa') ?? null,
          page_url: window.location.href,
        })
      if (error) throw error
      setUiState('success')
    } catch {
      setUiState('error')
    }
  }

  const tapTransition = { type: 'spring' as const, ...springs.snappy }

  const cardVariants = prefersReduced
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { duration: 0.01 } },
        exit:   { opacity: 0, transition: { duration: 0.01 } },
      }
    : {
        hidden:  { opacity: 0, scale: 0.95, y: 8 },
        visible: {
          opacity: 1, scale: 1, y: 0,
          transition: { type: 'spring' as const, ...springs.gentle },
        },
        exit: {
          opacity: 0, scale: 0.97, y: 4,
          transition: { duration: 0.15, ease: [0.4, 0, 1, 1] as [number, number, number, number] },
        },
      }

  // ── Positioning ─────────────────────────────────────────────────────────────

  const cardStyle: React.CSSProperties = {
    position:     'fixed',
    bottom:       isMobile ? 72 : 80,
    right:        isMobile ? 16 : 24,
    width:        isMobile ? 'calc(100vw - 32px)' : 320,
    background:   'var(--n-0)',
    borderRadius: 'var(--r-lg)',
    border:       '1px solid var(--n-150)',
    boxShadow:    'var(--sh-lg)',
    padding:      20,
    zIndex:       600, // z-modal
    transformOrigin: 'top right',
  }

  const isEmpty = !message.trim()
  const isLoading = uiState === 'loading'

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="frb-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={handleClose}
            style={{
              position:   'fixed',
              inset:      0,
              background: 'rgba(26,25,23,.4)',
              zIndex:     500, // z-backdrop
            }}
          />
        )}
      </AnimatePresence>

      {/* Modal card */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="frb-card"
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={cardStyle}
          >
            {uiState === 'success' ? (
              /* ── Success state ───────────────────────────────────────── */
              <div style={{
                display:        'flex',
                flexDirection:  'column',
                alignItems:     'center',
                paddingTop:     8,
                paddingBottom:  8,
              }}>
                <div style={{
                  width:        40,
                  height:       40,
                  borderRadius: '50%',
                  background:   'var(--pos-50)',
                  border:       '1px solid rgba(58,155,85,.2)',
                  display:      'flex',
                  alignItems:   'center',
                  justifyContent: 'center',
                }}>
                  <CheckIcon />
                </div>
                <p style={{
                  fontFamily:  "'Inter', system-ui, sans-serif",
                  fontSize:    15,
                  fontWeight:  500,
                  color:       'var(--n-900)',
                  marginTop:   12,
                  textAlign:   'center',
                }}>
                  Thanks for the input.
                </p>
                <p style={{
                  fontFamily:  "'Inter', system-ui, sans-serif",
                  fontSize:    13,
                  color:       'var(--n-500)',
                  textAlign:   'center',
                  lineHeight:  1.6,
                  marginTop:   6,
                  maxWidth:    220,
                }}>
                  We read every submission. This one is in the queue.
                </p>
              </div>
            ) : (
              /* ── Idle / loading / error state ────────────────────────── */
              <>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{
                      fontFamily: "'Inter', system-ui, sans-serif",
                      fontSize:   14,
                      fontWeight: 500,
                      color:      'var(--n-900)',
                      lineHeight: 1.3,
                    }}>
                      What should we build next?
                    </p>
                    <p style={{
                      fontFamily: "'Inter', system-ui, sans-serif",
                      fontSize:   12,
                      color:      'var(--n-400)',
                      marginTop:  2,
                    }}>
                      These are the top asks so far.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleClose}
                    aria-label="Close"
                    style={{
                      display:        'flex',
                      alignItems:     'center',
                      justifyContent: 'center',
                      width:          26,
                      height:         26,
                      borderRadius:   '50%',
                      border:         '1px solid var(--n-100)',
                      background:     'var(--n-0)',
                      color:          'var(--n-400)',
                      cursor:         'pointer',
                      flexShrink:     0,
                      marginLeft:     8,
                    }}
                  >
                    <CloseIcon />
                  </button>
                </div>

                {/* Top requests — idle state only */}
                {uiState !== 'loading' && (
                  <div style={{ margin: '12px 0 14px' }}>
                    <div style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 11, fontWeight: 500,
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                      color: 'var(--n-400)', marginBottom: 8,
                    }}>
                      Most requested
                    </div>
                    {TOP_REQUESTS.map((req, i) => (
                      <div
                        key={req}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '6px 0',
                          borderBottom: i < TOP_REQUESTS.length - 1 ? '1px solid var(--n-100)' : 'none',
                        }}
                      >
                        <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--n-200)', flexShrink: 0 }} />
                        <span style={{
                          fontFamily: "'Inter', system-ui, sans-serif",
                          fontSize: 12, color: 'var(--n-600)', lineHeight: 1.4,
                        }}>{req}</span>
                      </div>
                    ))}
                    <div style={{ height: 1, background: 'var(--n-100)', margin: '14px 0' }} />
                  </div>
                )}

                {/* Textarea */}
                <div style={{ marginTop: uiState === 'loading' ? 14 : 0 }}>
                  <style>{`
                    .frb-ta::placeholder { color: var(--n-300); }
                    .frb-ta:focus {
                      border-color: var(--p-400) !important;
                      box-shadow: 0 0 0 3px rgba(99,106,197,.12) !important;
                    }
                  `}</style>
                  <textarea
                    className="frb-ta"
                    value={message}
                    maxLength={CHAR_LIMIT}
                    placeholder="e.g. Show me which providers raised rates the most this year..."
                    onChange={e => {
                      setMessage(e.target.value)
                      if (uiState === 'error') setUiState('idle')
                    }}
                    style={{
                      fontFamily:   "'Inter', system-ui, sans-serif",
                      fontSize:     14,
                      lineHeight:   1.6,
                      width:        '100%',
                      minHeight:    88,
                      padding:      '10px 12px',
                      border:       '1.5px solid var(--n-100)',
                      borderRadius: 'var(--r-md)',
                      background:   'var(--n-0)',
                      color:        'var(--n-900)',
                      resize:       'none',
                      outline:      'none',
                      boxSizing:    'border-box',
                      transition:   'border-color .15s, box-shadow .15s',
                    }}
                  />
                  <p style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize:   11,
                    color:      'var(--n-400)',
                    marginTop:  4,
                    textAlign:  'right',
                  }}>
                    {message.length} / {CHAR_LIMIT}
                  </p>
                </div>

                {/* Submit */}
                <motion.button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isEmpty || isLoading}
                  whileTap={isEmpty || isLoading ? {} : { scale: 0.97, transition: tapTransition }}
                  style={{
                    marginTop:    12,
                    width:        '100%',
                    background:   'var(--p-600)',
                    color:        'var(--n-0)',
                    fontFamily:   "'Inter', system-ui, sans-serif",
                    fontSize:     14,
                    fontWeight:   500,
                    padding:      '10px 0',
                    borderRadius: 9999,
                    border:       'none',
                    cursor:       isEmpty || isLoading ? 'not-allowed' : 'pointer',
                    opacity:      isEmpty || isLoading ? 0.32 : 1,
                    transition:   'background .15s, opacity .15s',
                  }}
                  onMouseEnter={e => {
                    if (!isEmpty && !isLoading) {
                      (e.currentTarget as HTMLButtonElement).style.background = 'var(--p-700)'
                    }
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'var(--p-600)'
                  }}
                >
                  {isLoading ? 'Sending…' : 'Send feedback'}
                </motion.button>

                {/* Error message */}
                {uiState === 'error' && (
                  <p style={{
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontSize:   12,
                    color:      'var(--neg-500)',
                    marginTop:  8,
                  }}>
                    Couldn't send that — try again.
                  </p>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

    </>
  )
}

export default React.memo(FeatureRequestButton)
