'use client'

import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { springs } from '@/lib/springs'
import { supabase } from '@/lib/supabase'

// ─── Constants ────────────────────────────────────────────────────────────────

const SH_SM = '0 1px 3px rgba(26,25,23,.06), 0 1px 2px rgba(26,25,23,.04)'
const CHAR_LIMIT = 280

type UIState = 'idle' | 'loading' | 'success' | 'error'

// ─── Icons ────────────────────────────────────────────────────────────────────

function LightbulbIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path
        d="M6.5 1.5a3.5 3.5 0 0 1 2 6.4V9.5a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5V7.9a3.5 3.5 0 0 1 2-6.4Z"
        stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"
      />
      <path d="M5 11h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M5.5 11.5h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

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

function FeatureRequestButton() {
  const [open,      setOpen]      = useState(false)
  const [message,   setMessage]   = useState('')
  const [uiState,   setUiState]   = useState<UIState>('idle')
  const [isMobile,  setIsMobile]  = useState(false)
  const [focused,   setFocused]   = useState(false)
  const prefersReduced = useReducedMotion()
  const closeTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef    = useRef<HTMLTextAreaElement>(null)

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
        setOpen(false)
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
  }, [uiState])

  function handleClose() {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    setOpen(false)
    setTimeout(() => {
      setUiState('idle')
      setMessage('')
    }, 200)
  }

  async function handleSubmit() {
    if (!message.trim()) return
    setUiState('loading')
    try {
      const { error } = await supabase
        .from('feature_requests')
        .insert({
          message:  message.trim(),
          fsa:      localStorage.getItem('ratemap_last_fsa') ?? null,
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

  const btnBottom = isMobile ? 20 : 28
  const btnRight  = isMobile ? 16 : 24

  const cardStyle: React.CSSProperties = {
    position:     'fixed',
    bottom:       isMobile ? 72 : 80,
    right:        isMobile ? 16 : 24,
    width:        isMobile ? 'calc(100vw - 32px)' : 320,
    background:   '#FFFFFF',
    borderRadius: 16,
    border:       '1px solid #E2E1DD',
    boxShadow:    '0 8px 28px rgba(26,25,23,.1), 0 2px 6px rgba(26,25,23,.05)',
    padding:      20,
    zIndex:       500,
    transformOrigin: 'bottom right',
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
              zIndex:     400,
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
                  background:   '#EDF7F0',
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
                  color:       '#1A1917',
                  marginTop:   12,
                  textAlign:   'center',
                }}>
                  Thanks for the input.
                </p>
                <p style={{
                  fontFamily:  "'Inter', system-ui, sans-serif",
                  fontSize:    13,
                  color:       '#7C7B72',
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
                      color:      '#1A1917',
                      lineHeight: 1.3,
                    }}>
                      What should we build next?
                    </p>
                    <p style={{
                      fontFamily: "'Inter', system-ui, sans-serif",
                      fontSize:   12,
                      color:      '#9A998F',
                      marginTop:  2,
                    }}>
                      Your feedback shapes the roadmap.
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
                      border:         '1px solid #EEEDEA',
                      background:     '#FFFFFF',
                      color:          '#9A998F',
                      cursor:         'pointer',
                      flexShrink:     0,
                      marginLeft:     8,
                    }}
                  >
                    <CloseIcon />
                  </button>
                </div>

                {/* Textarea */}
                <div style={{ marginTop: 14 }}>
                  <style>{`
                    .frb-ta::placeholder { color: #D4D3CE; }
                    .frb-ta:focus {
                      border-color: #636AC5 !important;
                      box-shadow: 0 0 0 3px rgba(74,80,176,.12) !important;
                    }
                  `}</style>
                  <textarea
                    ref={textareaRef}
                    className="frb-ta"
                    value={message}
                    maxLength={CHAR_LIMIT}
                    placeholder="e.g. Show me which providers raised rates the most this year..."
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
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
                      border:       '1.5px solid #EEEDEA',
                      borderRadius: 10,
                      background:   '#FFFFFF',
                      color:        '#1A1917',
                      resize:       'none',
                      outline:      'none',
                      boxSizing:    'border-box',
                      transition:   'border-color .15s, box-shadow .15s',
                    }}
                  />
                  <p style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize:   11,
                    color:      '#B8B7B1',
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
                    background:   '#3A3F8F',
                    color:        '#FFFFFF',
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
                      (e.currentTarget as HTMLButtonElement).style.background = '#2D3170'
                    }
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = '#3A3F8F'
                  }}
                >
                  {isLoading ? 'Sending…' : 'Send feedback'}
                </motion.button>

                {/* Error message */}
                {uiState === 'error' && (
                  <p style={{
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontSize:   12,
                    color:      '#B33C28',
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

      {/* Trigger button */}
      <motion.button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close feature request' : "What's next?"}
        whileTap={{ scale: 0.97, transition: tapTransition }}
        style={{
          position:       'fixed',
          bottom:         btnBottom,
          right:          btnRight,
          zIndex:         99,
          fontFamily:     "'Inter', system-ui, sans-serif",
          fontSize:       13,
          fontWeight:     500,
          padding:        isMobile ? 0 : '9px 16px',
          width:          isMobile ? 36 : 'auto',
          height:         isMobile ? 36 : 'auto',
          borderRadius:   9999,
          border:         '1px solid #D4D3CE',
          background:     '#FFFFFF',
          color:          '#5E5D56',
          boxShadow:      SH_SM,
          cursor:         'pointer',
          display:        'flex',
          alignItems:     'center',
          justifyContent: isMobile ? 'center' : undefined,
          gap:            isMobile ? 0 : 7,
          transition:     'background .15s, border-color .15s',
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLButtonElement
          el.style.background    = '#FAFAF8'
          el.style.borderColor   = '#B8B7B1'
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLButtonElement
          el.style.background    = '#FFFFFF'
          el.style.borderColor   = '#D4D3CE'
        }}
      >
        <LightbulbIcon />
        {!isMobile && "What's next?"}
      </motion.button>
    </>
  )
}

export default React.memo(FeatureRequestButton)
