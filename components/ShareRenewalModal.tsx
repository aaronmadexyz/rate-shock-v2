'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { getAreaLabel } from '@/lib/fsaData'
import { supabase } from '@/lib/supabase'
import { fetchFsaCount } from '@/lib/fetchFsaCount'
import { setNavState } from '@/components/Nav'
import { useReducedMotion } from '@/lib/motionSafety'
import { playRip, playSeal, playChime } from '@/lib/sounds'
import { safeSetItem, safeGetItem, safeRemoveItem } from '@/lib/storage'
import { getCentroid } from '@/lib/fsaCentroids'
import type { Submission } from '@/lib/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const SC = ['', '#3A9B55', '#93D1A2', '#D49316', '#E87460', '#D4503A']
const SENT_LABELS = ['', 'Very fair', 'Fair', 'Neutral', 'Unfair', 'Very unfair']
const DRAFT_KEY       = 'rateshock_form_draft'
const DRAFT_SHOWN_KEY = 'rateshock_draft_shown'

const VP_MAP   = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'
const VP_MODAL = 'width=device-width, initial-scale=1, viewport-fit=cover'

const PROVIDERS = [
  'Intact', 'Aviva', 'TD Insurance', 'Desjardins', 'Belairdirect',
  'CAA Insurance', 'Economical', 'Wawanesa', 'Travelers', 'Co-operators',
  'Gore Mutual', 'Sonnet', 'Allstate', 'Other',
]

const ONTARIO_PREFIXES = new Set(['K', 'L', 'M', 'N', 'P'])

function validatePayload(payload: {
  fsa: string
  insurance_type: string
  provider: string
  sentiment: number
  rate_change_pct: number | null
}): string | null {
  if (!/^[A-Z][0-9][A-Z]$/.test(payload.fsa) || !ONTARIO_PREFIXES.has(payload.fsa[0])) {
    console.error('[ShareRenewalModal] Validation failed: fsa =', payload.fsa)
    return 'Invalid FSA'
  }
  if (payload.insurance_type !== 'auto' && payload.insurance_type !== 'home') {
    console.error('[ShareRenewalModal] Validation failed: insurance_type =', payload.insurance_type)
    return 'Invalid insurance type'
  }
  if (!PROVIDERS.includes(payload.provider)) {
    console.error('[ShareRenewalModal] Validation failed: provider =', payload.provider)
    return 'Invalid provider'
  }
  if (!Number.isInteger(payload.sentiment) || payload.sentiment < 1 || payload.sentiment > 5) {
    console.error('[ShareRenewalModal] Validation failed: sentiment =', payload.sentiment)
    return 'Invalid sentiment'
  }
  if (payload.rate_change_pct !== null && (payload.rate_change_pct < 0 || payload.rate_change_pct > 200)) {
    console.error('[ShareRenewalModal] Validation failed: rate_change_pct =', payload.rate_change_pct)
    return 'Invalid rate change percentage'
  }
  return null
}

// ─── Easing ───────────────────────────────────────────────────────────────────

function easeInOut(t: number) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t }
function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3) }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function faceSvgHtml(s: number): string {
  const c = ['', '#3A9B55', '#2A7D41', '#92600A', '#B33C28', '#8C2E1E'][s]
  const m = ['', 'M9 19Q17 26 25 19', 'M11 20Q17 24 23 20', 'M11 22L23 22', 'M11 24Q17 20 23 24', 'M9 25Q17 19 25 25'][s]
  return `<svg width="52" height="52" viewBox="0 0 34 34" aria-hidden="true"><circle cx="12" cy="13" r="2.1" fill="${c}"/><circle cx="22" cy="13" r="2.1" fill="${c}"/><path d="${m}" stroke="${c}" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>`
}

function sliderLabel(val: number, mode: 'pct' | 'dol'): { text: string; color: string } {
  if (mode === 'dol') {
    if (val < 150)  return { text: 'Below the typical increase', color: 'var(--n-400)' }
    if (val < 400)  return { text: 'Around the Ontario average', color: 'var(--n-400)' }
    if (val < 800)  return { text: 'Above the Ontario average', color: 'var(--cau-500)' }
    if (val < 1300) return { text: 'A significant increase', color: 'var(--cau-500)' }
    return { text: 'An exceptional increase', color: 'var(--neg-500)' }
  }
  if (val <= 4)  return { text: 'Below average · Most Ontario renewals are higher', color: 'var(--n-400)' }
  if (val <= 9)  return { text: 'Around the Ontario average', color: 'var(--n-400)' }
  if (val <= 16) return { text: 'Above the Ontario average', color: 'var(--cau-500)' }
  if (val <= 24) return { text: 'Significantly above average', color: 'var(--cau-500)' }
  if (val <= 34) return { text: 'Well above average · Worth verifying this', color: 'var(--neg-500)' }
  return { text: 'Exceptionally high — this should definitely be verified', color: 'var(--neg-500)' }
}

function heroColor(val: number, mode: 'pct' | 'dol'): string {
  if (mode === 'dol') {
    if (val < 300)  return 'var(--n-600)'
    if (val < 800)  return 'var(--n-900)'
    if (val < 1300) return 'var(--cau-600)'
    return 'var(--neg-500)'
  }
  if (val <= 7)  return 'var(--n-600)'
  if (val <= 14) return 'var(--n-900)'
  if (val <= 24) return 'var(--cau-600)'
  return 'var(--neg-500)'
}

function formatSliderVal(val: number, mode: 'pct' | 'dol'): string {
  if (mode === 'pct') return val >= 50 ? '50%+' : `${val}%`
  return val >= 2000 ? '$2,000+' : `$${val.toLocaleString()}`
}

function calculatePct(dollarIncrease: number, previousPremium: number): number {
  if (previousPremium <= 0) return 0
  return Math.round((dollarIncrease / previousPremium) * 100)
}

function medianOf(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const LABEL_STYLE: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--n-400)',
  marginBottom: 6, letterSpacing: '.04em', textTransform: 'uppercase',
}

const SB_STYLE: React.CSSProperties = {
  width: 40, height: 40, border: 'none', background: '#FFFFFF',
  cursor: 'pointer', fontSize: 17, color: 'var(--n-400)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'background .12s', fontFamily: "'Inter', system-ui, sans-serif",
  flexShrink: 0, lineHeight: 1, padding: 0,
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 'anim'

interface StepperVal {
  v: number
  k: number       // key — increments to trigger animation
  dir: 'up' | 'down'
}

interface ShareRenewalModalProps {
  isOpen: boolean
  onClose: () => void
  onVerify?: () => void
  onSubmitted?: (sub: Submission) => void
  onZoomToPost?: (fsa: string) => void
  onEnableLikeMe?: () => void
}

// ─── Stepper component ────────────────────────────────────────────────────────

function Stepper({
  s, min, max, label, onAdj, inputId, decreaseLabel, increaseLabel,
}: {
  s: StepperVal
  min: number
  max: number
  label: string
  onAdj: (d: 1 | -1) => void
  inputId?: string
  decreaseLabel?: string
  increaseLabel?: string
}) {
  const displayVal = `${s.v}${s.v === max ? '+' : ''}`
  const anim = s.k > 0
    ? `${s.dir === 'up' ? 'snUp' : 'snDown'} 180ms ease both`
    : undefined

  return (
    <div>
      <label htmlFor={inputId} style={LABEL_STYLE}>{label}</label>
      <div style={{
        display: 'flex', alignItems: 'center',
        border: '1px solid #EEEDEA', borderRadius: 10,
        overflow: 'hidden', width: 'fit-content',
      }}>
        <button
          type="button"
          onClick={() => onAdj(-1)}
          disabled={s.v <= min}
          aria-label={decreaseLabel}
          style={{ ...SB_STYLE, opacity: s.v <= min ? 0.4 : 1 }}
        >−</button>
        <div aria-live="polite" aria-atomic="true" style={{ borderLeft: '1px solid #EEEDEA', borderRight: '1px solid #EEEDEA' }}>
          <span
            id={inputId}
            key={s.k}
            style={{
              minWidth: 40, textAlign: 'center', fontSize: 14, fontWeight: 500,
              color: '#1A1917', lineHeight: '40px',
              background: '#FFFFFF', display: 'block',
              animation: anim,
            }}
          >{displayVal}</span>
        </div>
        <button
          type="button"
          onClick={() => onAdj(1)}
          disabled={s.v >= max}
          aria-label={increaseLabel}
          style={{ ...SB_STYLE, opacity: s.v >= max ? 0.4 : 1 }}
        >+</button>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ShareRenewalModal({ isOpen, onClose, onVerify, onSubmitted, onZoomToPost, onEnableLikeMe }: ShareRenewalModalProps) {
  // ── form state ──────────────────────────────────────────────────────────────
  const [step, setStep]           = useState<Step>(1)
  const [fsa, setFsa]             = useState('')
  const [fsaError, setFsaError]   = useState(false)
  const [areaLabel, setAreaLabel] = useState('')
  const [fsaCount, setFsaCount]   = useState(0)
  const [insType, setInsType]     = useState<'auto' | 'home'>('auto')
  const [provider, setProvider]   = useState('')
  const [provErr, setProvErr]     = useState(false)
  const [steppers, setSteppers]   = useState<Record<string, StepperVal>>({
    yrs: { v: 0, k: 0, dir: 'up' }, cl:  { v: 0, k: 0, dir: 'up' },
    cv:  { v: 0, k: 0, dir: 'up' },
    hcl: { v: 0, k: 0, dir: 'up' },
  })
  const [mode, setMode]           = useState<'pct' | 'dol'>('dol')
  const [rval, setRval]           = useState(480)
  const [prevPrem, setPrevPrem]   = useState<number | null>(null)
  const [prevPremError, setPrevPremError] = useState('')

  // ── post-submit patch state (dollar-mode → add prevPrem later) ───────────────
  const [submissionId, setSubmissionId]   = useState<string | null>(null)
  const [dollarAmount, setDollarAmount]   = useState<number | null>(null)
  const [patchDone, setPatchDone]         = useState(false)
  const [patchLoading, setPatchLoading]   = useState(false)
  const [patchError, setPatchError]       = useState('')
  const patchInputRef = useRef<HTMLInputElement>(null)
  const [trackBg, setTrackBg]     = useState('linear-gradient(to right,#1A1917 24%,#D4D3CE 24%)')
  const [sent, setSent]           = useState(0)
  const [sentErr, setSentErr]     = useState(false)
  const [note, setNote]           = useState('')
  const [consent, setConsent]     = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [provSearch, setProvSearch] = useState('')
  const [fsaCountLoading, setFsaCountLoading] = useState(false)

  // ── draft rescue state ──────────────────────────────────────────────────────
  const [showRestoreNotice, setShowRestoreNotice] = useState(false)

  // ── post-anim state ─────────────────────────────────────────────────────────
  const [animDone, setAnimDone]         = useState(false)
  const [showVerify, setShowVerify]     = useState(false)
  const [showLikeMeCard, setShowLikeMeCard] = useState(false)
  const [compLoading, setCompLoading] = useState(false)
  const [areaMed,    setAreaMed]    = useState<number | null>(null)
  const [areaMedCount, setAreaMedCount] = useState(0)
  const [ontMed,     setOntMed]     = useState<number | null>(null)
  const [cntYou, setCntYou]         = useState(0)
  const [cntNbr, setCntNbr]         = useState(0)
  const [cntOnt, setCntOnt]         = useState(0)

  // ── animation element refs ──────────────────────────────────────────────────
  const envFlapRef    = useRef<SVGSVGElement>(null)
  const flapPolyRef   = useRef<SVGPolygonElement>(null)
  const flapEdgeRef   = useRef<SVGPolylineElement>(null)
  const sealGroupRef  = useRef<SVGGElement>(null)
  const sealCircleRef = useRef<SVGCircleElement>(null)
  const envLetterRef  = useRef<HTMLDivElement>(null)
  const letterFaceRef = useRef<HTMLDivElement>(null)
  const ripLRef       = useRef<HTMLDivElement>(null)
  const ripRRef       = useRef<HTMLDivElement>(null)
  const ripCrackRef   = useRef<HTMLDivElement>(null)
  const ptcWrapRef    = useRef<HTMLDivElement>(null)
  const envSceneRef   = useRef<HTMLDivElement>(null)
  const amsgRef       = useRef<HTMLDivElement>(null)
  const rafRef          = useRef<number>(0)
  const pioneerNameRef  = useRef<HTMLElement>(null)

  const { prefersReduced } = useReducedMotion()
  const prefersReducedRef  = useRef(prefersReduced)
  prefersReducedRef.current = prefersReduced
  const lastSubmitRef      = useRef<number>(0)
  const modalRef           = useRef<HTMLDivElement>(null)
  const triggerRef         = useRef<HTMLElement | null>(null)
  const counterRef         = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingFsaRef      = useRef<string>('')

  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 680)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Lock body scroll when modal is open (prevents map pan-through on mobile)
  // Also re-enable pinch zoom inside the modal so content is readable.
  useEffect(() => {
    const vp = document.querySelector('meta[name=viewport]')
    if (isOpen) {
      document.body.style.overflow  = 'hidden'
      document.body.style.position  = 'fixed'
      document.body.style.width     = '100%'
      vp?.setAttribute('content', VP_MODAL)
    } else {
      document.body.style.overflow  = ''
      document.body.style.position  = ''
      document.body.style.width     = ''
      vp?.setAttribute('content', VP_MAP)
    }
    return () => {
      document.body.style.overflow  = ''
      document.body.style.position  = ''
      document.body.style.width     = ''
      vp?.setAttribute('content', VP_MAP)
    }
  }, [isOpen])

  // ── draft rescue: save after every field change (only when meaningful) ────────
  useEffect(() => {
    if (!isOpen || step === 'anim') return
    const meaningful =
      fsa.length > 0 ||
      provider.length > 0 ||
      insType !== 'auto' ||
      step === 2 ||
      steppers.yrs.v !== 0 || steppers.cl.v !== 0 ||
      steppers.cv.v !== 0  || steppers.hcl.v !== 0
    if (!meaningful) return
    safeSetItem(DRAFT_KEY, JSON.stringify({
      fsa, type: insType, provider, mode,
      rval, prevPrem, yrs: steppers.yrs.v, cl: steppers.cl.v,
      cv: steppers.cv.v, hcl: steppers.hcl.v, sent,
    }))
  }, [isOpen, step, fsa, insType, provider, mode, rval, prevPrem, steppers, sent])

  // ── draft rescue: restore when modal opens ──────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    const raw = safeGetItem(DRAFT_KEY)
    if (!raw) return
    try {
      const d = JSON.parse(raw)

      // Only restore if the draft contains meaningful content
      const meaningful =
        d.fsa?.length > 0 ||
        d.provider?.length > 0 ||
        d.type !== 'auto' ||
        d.yrs !== 0 || d.cl !== 0 || d.cv !== 0 || d.hcl !== 0
      if (!meaningful) return

      if (d.fsa) {
        setFsa(d.fsa)
        setAreaLabel(getAreaLabel(d.fsa))
        if (d.fsa.length === 3) {
          setFsaCountLoading(true)
          setFsaCount(0)
          fetchFsaCount(d.fsa).then(count => {
            setFsaCount(count)
            setFsaCountLoading(false)
          })
        }
      }
      if (d.type)     setInsType(d.type)
      if (d.provider) setProvider(d.provider)
      if (d.mode)        setMode(d.mode)
      if (d.rval != null) setRval(d.rval)
      if (d.prevPrem != null) setPrevPrem(d.prevPrem)
      if (d.sent)        setSent(d.sent)
      if (d.yrs != null || d.cl != null || d.cv != null || d.hcl != null) {
        setSteppers(prev => ({
          yrs: { ...prev.yrs, v: d.yrs ?? prev.yrs.v },
          cl:  { ...prev.cl,  v: d.cl  ?? prev.cl.v  },
          cv:  { ...prev.cv,  v: d.cv  ?? prev.cv.v  },
          hcl: { ...prev.hcl, v: d.hcl ?? prev.hcl.v },
        }))
      }

      // Show banner only if it hasn't been shown and dismissed this session
      if (!safeGetItem(DRAFT_SHOWN_KEY)) {
        setShowRestoreNotice(true)
      }
    } catch { /* ignore malformed draft */ }

    // Restore pending dollar-patch state from a previous session
    try {
      const pendingMode   = localStorage.getItem('rateshock_submission_mode')
      const pendingDollar = localStorage.getItem('rateshock_dollar_amount')
      const pendingId     = localStorage.getItem('rateshock_submission_id')
      if (pendingMode === 'dol' && pendingDollar && pendingId) {
        setSubmissionId(pendingId)
        setDollarAmount(parseInt(pendingDollar, 10))
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // ── focus trap: save trigger and restore on close ───────────────────────────
  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement
    } else {
      triggerRef.current?.focus()
    }
  }, [isOpen])

  // ── focus trap: move focus into modal on open ────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    const t = setTimeout(() => {
      const firstFocusable = modalRef.current?.querySelector<HTMLElement>(
        'button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
      )
      firstFocusable?.focus()
    }, 50)
    return () => clearTimeout(t)
  }, [isOpen])

  // ── focus trap: Tab key handler ──────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Tab') return
    const modal = modalRef.current
    if (!modal) return
    const focusable = Array.from(
      modal.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])'
      )
    ).filter(el => !el.closest('[aria-hidden="true"]'))

    const first = focusable[0]
    const last  = focusable[focusable.length - 1]

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  // ── update track background ─────────────────────────────────────────────────
  const updateTrack = useCallback((v: number, mn: number, mx: number) => {
    const p = Math.round(((v - mn) / (mx - mn)) * 100)
    setTrackBg(`linear-gradient(to right,#1A1917 ${p}%,#D4D3CE ${p}%)`)
  }, [])

  // ── reset ───────────────────────────────────────────────────────────────────
  const resetAll = useCallback(() => {
    setStep(1); setFsa(''); setFsaError(false); setAreaLabel(''); setFsaCount(0)
    setInsType('auto'); setProvider(''); setProvErr(false); setProvSearch('')
    setSteppers({
      yrs: { v: 0, k: 0, dir: 'up' }, cl:  { v: 0, k: 0, dir: 'up' },
      cv:  { v: 0, k: 0, dir: 'up' },
      hcl: { v: 0, k: 0, dir: 'up' },
    })
    setMode('dol'); setRval(480); updateTrack(480, 0, 2000)
    setPrevPrem(null); setPrevPremError('')
    setSubmissionId(null); setDollarAmount(null)
    setPatchDone(false); setPatchLoading(false); setPatchError('')
    setSent(0); setSentErr(false); setNote(''); setConsent(false)
    setSubmitting(false); setAnimDone(false); setShowVerify(false); setShowLikeMeCard(false)
    setShowRestoreNotice(false)
    safeRemoveItem(DRAFT_KEY)
    safeRemoveItem(DRAFT_SHOWN_KEY)
    setCompLoading(false); setAreaMed(null); setAreaMedCount(0); setOntMed(null)
    setCntYou(0); setCntNbr(0); setCntOnt(0)

    // reset envelope DOM
    if (flapPolyRef.current)   flapPolyRef.current.setAttribute('points', '0,0 180,0 90,68')
    if (flapPolyRef.current)   flapPolyRef.current.setAttribute('fill', '#ECE9E3')
    if (flapEdgeRef.current)   flapEdgeRef.current.setAttribute('points', '0,0 90,68 180,0')
    if (envFlapRef.current)  { envFlapRef.current.style.filter = 'none'; envFlapRef.current.style.zIndex = '4' }
    if (sealGroupRef.current)  sealGroupRef.current.style.opacity = '1'
    if (sealCircleRef.current) sealCircleRef.current.setAttribute('fill', '#D4D3CE')
    if (envLetterRef.current) {
      envLetterRef.current.className = ''
      envLetterRef.current.style.cssText = 'position:absolute;left:14px;right:14px;top:14px;height:140px;background:#FFFFFF;border:1px solid #DDDBD6;border-radius:4px;box-shadow:0 2px 10px rgba(26,25,23,.1);z-index:2;opacity:0;transform:translateY(0px)'
    }
    if (letterFaceRef.current) { letterFaceRef.current.innerHTML = ''; letterFaceRef.current.style.opacity = '0' }
    const ripStyle = 'position:absolute;left:14px;right:14px;top:14px;height:140px;background:#FFFFFF;border:1px solid #DDDBD6;border-radius:4px;z-index:6;opacity:0;animation:none'
    if (ripLRef.current)    { ripLRef.current.style.cssText = ripStyle; ripLRef.current.innerHTML = '' }
    if (ripRRef.current)    { ripRRef.current.style.cssText = ripStyle; ripRRef.current.innerHTML = '' }
    if (ripCrackRef.current) ripCrackRef.current.style.cssText = 'position:absolute;left:50%;width:2px;top:14px;height:140px;margin-left:-1px;background:linear-gradient(to bottom,transparent,#E87460 15%,#E87460 85%,transparent);z-index:7;opacity:0;transform:scaleY(0);transform-origin:top'
    if (ptcWrapRef.current)  ptcWrapRef.current.innerHTML = ''
    if (envSceneRef.current) envSceneRef.current.style.cssText = ''
    if (amsgRef.current)   { amsgRef.current.style.visibility = 'hidden'; amsgRef.current.style.animation = '' }
  }, [updateTrack])

  const handleClose = useCallback(() => {
    onClose()
    setTimeout(resetAll, 420)
  }, [onClose, resetAll])

  // ── FSA input ───────────────────────────────────────────────────────────────
  async function onFsaInput(val: string) {
    const v = val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3)
    setFsa(v)
    setFsaError(false)
    setAreaLabel(v.length >= 1 ? getAreaLabel(v) : '')
    if (v.length === 3) {
      pendingFsaRef.current = v
      setFsaCountLoading(true)
      setFsaCount(0)
      const count = await fetchFsaCount(v)
      if (pendingFsaRef.current === v) {
        setFsaCount(count)
        setFsaCountLoading(false)
      }
    } else {
      pendingFsaRef.current = ''
      setFsaCount(0)
      setFsaCountLoading(false)
    }
  }

  // ── Stepper adjust ──────────────────────────────────────────────────────────
  const cfg: Record<string, { min: number; max: number }> = {
    yrs: { min: 0, max: 30 }, cl:  { min: 0, max: 5 },
    cv:  { min: 0, max: 3  },
    hcl: { min: 0, max: 5  },
  }
  function adj(f: string, d: 1 | -1) {
    setSteppers(prev => {
      const cur = prev[f]; const { min, max } = cfg[f]
      const newV = Math.max(min, Math.min(max, cur.v + d))
      if (newV === cur.v) return prev
      return { ...prev, [f]: { v: newV, k: cur.k + 1, dir: d > 0 ? 'up' : 'down' } }
    })
  }

  // ── Mode / range ────────────────────────────────────────────────────────────
  function switchMode(m: 'pct' | 'dol') {
    setMode(m)
    if (m === 'pct') { setRval(12); updateTrack(12, 0, 50) }
    else             { setRval(480); updateTrack(480, 0, 2000) }
  }
  function onRange(v: number) {
    setRval(v)
    if (prevPremError) setPrevPremError('')
    const mn = 0
    const mx = mode === 'pct' ? 50 : 2000
    updateTrack(v, mn, mx)
  }

  // ── Dollar-patch: update row with calculated rate_change_pct ────────────────
  async function patchWithPreviousPremium(prevPremVal: number): Promise<boolean> {
    if (!submissionId || !dollarAmount || prevPremVal <= 0) return false
    const pct = Math.round((dollarAmount / prevPremVal) * 100)
    if (pct < 0 || pct > 200) return false
    try {
      const { error } = await supabase
        .from('submissions')
        .update({ rate_change_pct: pct, rate_change_dollar: null })
        .eq('id', submissionId)
      if (error) return false
      try {
        localStorage.removeItem('rateshock_dollar_amount')
        localStorage.removeItem('rateshock_submission_id')
        localStorage.removeItem('rateshock_submission_mode')
      } catch { /* ignore */ }
      return true
    } catch {
      return false
    }
  }

  async function handlePatch() {
    const rawVal     = patchInputRef.current?.value ?? ''
    const prevPremVal = parseInt(rawVal, 10)
    if (isNaN(prevPremVal) || prevPremVal <= 0) {
      setPatchError('Please enter a valid previous premium amount')
      return
    }
    const pct = dollarAmount ? Math.round((dollarAmount / prevPremVal) * 100) : 0
    if (pct < 0 || pct > 200) {
      setPatchError("That doesn't look right — check your previous premium amount")
      return
    }
    setPatchLoading(true)
    setPatchError('')
    const success = await patchWithPreviousPremium(prevPremVal)
    setPatchLoading(false)
    if (!success) {
      setPatchError("That doesn't look right — check your previous premium amount")
      return
    }
    // Update local state so comparison card shows percentage
    setPrevPrem(prevPremVal)
    setPatchDone(true)
    // Refresh comparison data now that a pct exists
    const fsaUpper = fsa.toUpperCase()
    ;(async () => {
      try {
        const [areaRes, ontRes] = await Promise.all([
          supabase.from('submissions').select('rate_change_pct').eq('fsa', fsaUpper).not('rate_change_pct', 'is', null).limit(100),
          supabase.from('submissions').select('rate_change_pct').not('rate_change_pct', 'is', null).limit(500),
        ])
        const areaPcts = (areaRes.data ?? []).map((r: { rate_change_pct: number | null }) => r.rate_change_pct).filter((v): v is number => v !== null)
        const ontPcts  = (ontRes.data  ?? []).map((r: { rate_change_pct: number | null }) => r.rate_change_pct).filter((v): v is number => v !== null)
        setAreaMed(medianOf(areaPcts))
        setAreaMedCount(areaPcts.length)
        setOntMed(medianOf(ontPcts))
      } catch { /* non-critical */ }
    })()
    // Auto-dismiss card after 2000ms
    setTimeout(() => {
      setSubmissionId(null)
      setDollarAmount(null)
    }, 2000)
  }

  // ── Nav ─────────────────────────────────────────────────────────────────────
  function goBack() {
    if (step === 2) setStep(1)
  }

  async function goNext() {
    if (step === 1) {
      if (fsa.length < 3) { setFsaError(true); return }
      if (!provider)      { setProvErr(true); return }
      setStep(2)
    } else if (step === 2) {
      if (sent === 0) { setSentErr(true); return }
      if (!consent)   return
      await handleSubmit()
    }
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    // Debounce: ignore double-taps within 5 seconds
    const now = Date.now()
    if (now - lastSubmitRef.current < 5000) return
    lastSubmitRef.current = now

    setSubmitting(true)

    const fsaUpper = fsa.toUpperCase()

    // Determine what to store based on mode + prevPrem
    let ratePct: number | null = null
    let rateDollar: number | null = null
    if (mode === 'pct') {
      ratePct   = rval
      rateDollar = null
    } else if (prevPrem !== null && prevPrem > 0) {
      ratePct   = calculatePct(rval, prevPrem)
      rateDollar = null
    } else {
      ratePct   = null
      rateDollar = rval
    }

    // Guard: unreasonable percentage (wrong previous premium entered)
    if (ratePct !== null && (ratePct < 0 || ratePct > 200)) {
      setPrevPremError("That doesn't look right — check your previous premium amount")
      setSubmitting(false)
      return
    }

    // Validate before touching Supabase
    const validationError = validatePayload({
      fsa:             fsaUpper,
      insurance_type:  insType,
      provider,
      sentiment:       sent,
      rate_change_pct: ratePct,
    })
    if (validationError) {
      setSubmitting(false)
      return
    }

    const payload = {
      fsa:                fsaUpper,
      neighbourhood:      getAreaLabel(fsa),
      insurance_type:     insType,
      provider,
      rate_change_pct:    ratePct,
      rate_change_dollar: rateDollar,
      mode:               mode === 'dol' ? 'dollar' : 'pct',
      years_licensed:     insType === 'auto' ? steppers.yrs.v : null,
      at_fault_claims:    insType === 'auto' ? steppers.cl.v  : 0,
      convictions:        insType === 'auto' ? steppers.cv.v  : 0,
      home_claims:        insType === 'home' ? steppers.hcl.v : 0,
      sentiment:          sent,
      comment_raw:        note || null,
    }

    // Build optimistic submission for the map — shown immediately without waiting for DB
    const optimisticSub: Submission = {
      id:                 crypto.randomUUID(),
      fsa:                fsaUpper,
      provider,
      insurance_type:     insType,
      rate_change_pct:    ratePct,
      rate_change_dollar: rateDollar,
      renewal_year:       null,
      mode:               mode === 'dol' ? 'dollar' : 'pct',
      sentiment:          sent,
      comment_raw:        note || null,
      verified:           false,
      neighbourhood:      getAreaLabel(fsa),
      created_at:         new Date().toISOString(),
      years_licensed:     insType === 'auto' ? steppers.yrs.v : null,
      at_fault_claims:    insType === 'auto' ? steppers.cl.v  : 0,
      convictions:        insType === 'auto' ? steppers.cv.v  : 0,
      home_claims:        insType === 'home' ? steppers.hcl.v : 0,
    }

    // Insert — fire-and-forget; capture the returned ID for the dollar-patch flow
    supabase
      .from('submissions')
      .insert(payload)
      .select('id')
      .single()
      .then(({ data: inserted, error }) => {
        if (error) {
          console.error('[ShareRenewalModal] Supabase insert error:', error.message)
          return
        }
        if (!inserted) return
        setSubmissionId(inserted.id as string)
        if (rateDollar !== null) {
          setDollarAmount(rateDollar)
          try {
            localStorage.setItem('rateshock_submission_id', String(inserted.id))
            localStorage.setItem('rateshock_submission_mode', 'dol')
            localStorage.setItem('rateshock_dollar_amount', String(rateDollar))
          } catch { /* ignore */ }
        }
      })

    // Fetch real comparison data in parallel — resolves well before comparison card appears
    safeRemoveItem(DRAFT_KEY)
    safeRemoveItem(DRAFT_SHOWN_KEY)
    setCompLoading(true);
    (async () => {
      try {
        const [areaRes, ontRes] = await Promise.all([
          supabase.from('submissions').select('rate_change_pct').eq('fsa', fsaUpper).not('rate_change_pct', 'is', null).limit(100),
          supabase.from('submissions').select('rate_change_pct').not('rate_change_pct', 'is', null).limit(500),
        ])
        const areaPcts = (areaRes.data ?? []).map((r: { rate_change_pct: number | null }) => r.rate_change_pct).filter((v): v is number => v !== null)
        const ontPcts  = (ontRes.data  ?? []).map((r: { rate_change_pct: number | null }) => r.rate_change_pct).filter((v): v is number => v !== null)
        setAreaMed(medianOf(areaPcts))
        setAreaMedCount(areaPcts.length)
        setOntMed(medianOf(ontPcts))
      } catch (err) {
        console.error('[ShareRenewalModal] Comparison fetch error:', err)
      } finally {
        setCompLoading(false)
      }
    })()

    // Update nav state and surface the submission to the map immediately
    setNavState('unverified')
    safeSetItem('ratemap_user_profile', JSON.stringify({
      insurance_type:  insType,
      provider,
      fsa:             fsaUpper,
      rate_change_pct: ratePct ?? 0,
      years_licensed:  insType === 'auto' ? steppers.yrs.v : null,
      at_fault_claims: insType === 'auto' ? steppers.cl.v  : null,
      convictions:     insType === 'auto' ? steppers.cv.v  : null,
      home_claims:     insType === 'home' ? steppers.hcl.v : null,
    }))
    onSubmitted?.(optimisticSub)

    setStep('anim')
    setSubmitting(false)
    setTimeout(() => playAnim(), 50)
  }

  // ── Provider pill roving tabindex keyboard handler ───────────────────────────
  function handleProvKeyDown(e: React.KeyboardEvent) {
    const pills = Array.from(
      document.querySelectorAll<HTMLElement>('#provGrid [role="radio"]')
    )
    const current = pills.indexOf(document.activeElement as HTMLElement)
    if (current === -1) return

    let next = current
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      next = (current + 1) % pills.length
      e.preventDefault()
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      next = (current - 1 + pills.length) % pills.length
      e.preventDefault()
    } else if (e.key === 'Enter' || e.key === ' ') {
      setProvider(pills[current].textContent?.trim() ?? '')
      setProvErr(false)
      e.preventDefault()
      return
    } else {
      return
    }
    pills[next].focus()
    setProvider(pills[next].textContent?.trim() ?? '')
    setProvErr(false)
  }

  // ── Note change with debounced counter aria-live ────────────────────────────
  function handleNoteChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setNote(e.target.value)
    const len = e.target.value.length
    const cc = document.getElementById('cc')
    if (cc) cc.setAttribute('aria-live', 'off')
    if (counterRef.current) clearTimeout(counterRef.current)
    counterRef.current = setTimeout(() => {
      const el = document.getElementById('cc')
      if (el) {
        el.setAttribute('aria-live', 'polite')
        el.setAttribute('aria-label', `${len} of 500 characters used`)
      }
    }, 800)
  }

  // ── Animation ────────────────────────────────────────────────────────────────

  const animateFlap = useCallback(() => {
    const TOTAL_DUR = 1100, PEAK_CLOSED = 68, PEAK_OPEN = -44
    let passedHinge = false, startT: number | null = null

    function step(ts: number) {
      if (!startT) startT = ts
      const raw = Math.min((ts - startT) / TOTAL_DUR, 1)
      const t   = easeInOut(raw)
      const peakY = lerp(PEAK_CLOSED, PEAK_OPEN, t)

      flapPolyRef.current?.setAttribute('points', `0,0 180,0 90,${peakY.toFixed(2)}`)
      flapEdgeRef.current?.setAttribute('points', `0,0 90,${peakY.toFixed(2)} 180,0`)

      if (!passedHinge && peakY <= 0) {
        passedHinge = true
        flapPolyRef.current?.setAttribute('fill', '#E2DDD7')
        if (sealGroupRef.current)  sealGroupRef.current.style.opacity  = '0'
        if (envFlapRef.current)    envFlapRef.current.style.filter     = 'url(#flapShadow)'
        if (!prefersReducedRef.current) playSeal()
      }

      if (!passedHinge && sealGroupRef.current) {
        const alpha = Math.max(0, 1 - t * 4)
        sealGroupRef.current.style.opacity = alpha.toFixed(3)
      }

      if (raw < 1) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        if (envFlapRef.current) envFlapRef.current.style.zIndex = '3'
      }
    }
    rafRef.current = requestAnimationFrame(step)
  }, [])

  const raiseLetter = useCallback(() => {
    const DUR = 950, RISE = 108
    let startT: number | null = null
    const letter = envLetterRef.current
    if (!letter) return
    letter.style.opacity = '1'
    letter.style.zIndex  = '5'

    const el = letter
    function tick(ts: number) {
      if (!startT) startT = ts
      const raw = Math.min((ts - startT) / DUR, 1)
      const t   = easeOutCubic(raw)
      el.style.transform = `translateY(-${Math.round(t * RISE)}px)`
      if (raw < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [])

  const spawnParticles = useCallback((color: string) => {
    const wrap = ptcWrapRef.current
    if (!wrap) return
    const sizes = [4, 6, 5, 7, 4, 5, 6, 4, 7, 5]
    for (let i = 0; i < 10; i++) {
      ((idx: number) => {
        setTimeout(() => {
          const p = document.createElement('div')
          const sz = sizes[idx]
          const dur = (0.7 + Math.random() * 0.65).toFixed(2)
          const lx  = (18 + Math.random() * 64).toFixed(1)
          p.style.cssText = `position:absolute;border-radius:50%;width:${sz}px;height:${sz}px;background:${color};left:${lx}%;top:46%;animation:ptcUp ${dur}s ease-out forwards`
          wrap.appendChild(p)
          setTimeout(() => p.parentNode?.removeChild(p), 1800)
        }, idx * 95)
      })(i)
    }
  }, [])

  const doRip = useCallback((s: number) => {
    const RISE_PX = 108
    const inner = `<div style="padding:14px 13px 0"><div style="height:2px;background:#EEEDEA;border-radius:1px;margin-bottom:10px"></div><div style="height:2px;background:#EEEDEA;border-radius:1px;margin-bottom:10px;width:70%"></div><div style="height:2px;background:#EEEDEA;border-radius:1px;margin-bottom:10px;width:50%"></div><div style="height:2px;background:#EEEDEA;border-radius:1px;margin-bottom:10px"></div><div style="height:2px;background:#EEEDEA;border-radius:1px;width:70%"></div></div><div style="display:flex;align-items:center;justify-content:center;padding-top:10px">${faceSvgHtml(s)}</div>`
    const shared = `position:absolute;left:14px;right:14px;height:140px;background:#FFFFFF;border:1px solid #DDDBD6;border-radius:4px;z-index:6;top:calc(14px - ${RISE_PX}px);`

    if (ripLRef.current)  { ripLRef.current.innerHTML  = inner; ripLRef.current.style.cssText  = shared + 'clip-path:inset(0 50% 0 0 round 4px 0 0 4px);opacity:1' }
    if (ripRRef.current)  { ripRRef.current.innerHTML  = inner; ripRRef.current.style.cssText  = shared + 'clip-path:inset(0 0 0 50% round 0 4px 4px 0);opacity:1' }
    if (ripCrackRef.current) ripCrackRef.current.style.cssText = `position:absolute;left:50%;width:2px;top:calc(14px - ${RISE_PX}px);height:140px;margin-left:-1px;background:linear-gradient(to bottom,transparent,#E87460 15%,#E87460 85%,transparent);z-index:7;opacity:1;animation:crackIn .65s ease forwards;transform-origin:top`
    if (envLetterRef.current) envLetterRef.current.style.opacity = '0'

    setTimeout(() => {
      if (!prefersReducedRef.current) playRip()
    }, 520)
    setTimeout(() => {
      if (ripLRef.current) ripLRef.current.style.animation = 'flyL .85s cubic-bezier(.4,0,1,1) forwards'
      if (ripRRef.current) ripRRef.current.style.animation = 'flyR .85s cubic-bezier(.4,0,1,1) forwards'
    }, 540)
  }, [])

  const playAnim = useCallback(() => {
    const color = SC[sent]
    const isPos = sent <= 2
    const isNeg = sent >= 4
    if (sealCircleRef.current) sealCircleRef.current.setAttribute('fill', color)

    setTimeout(() => animateFlap(),   500)
    setTimeout(() => raiseLetter(),  1700)
    setTimeout(() => {
      if (letterFaceRef.current) {
        letterFaceRef.current.innerHTML = faceSvgHtml(sent)
        letterFaceRef.current.style.opacity = '1'
      }
    }, 2700)
    setTimeout(() => {
      if (isPos) {
        if (envLetterRef.current) envLetterRef.current.style.animation = 'glowG 2s ease-in-out infinite'
        spawnParticles(color)
      } else if (isNeg) {
        doRip(sent)
      }
    }, 3100)
    setTimeout(() => revealSuccess(isPos, isNeg), isNeg ? 4200 : 3700)
  }, [sent, animateFlap, raiseLetter, spawnParticles, doRip])

  function revealSuccess(isPos: boolean, isNeg: boolean) {
    // Shrink envelope scene to top
    if (envSceneRef.current) {
      envSceneRef.current.style.transition = 'transform .55s cubic-bezier(.16,1,.3,1), margin .55s cubic-bezier(.16,1,.3,1)'
      envSceneRef.current.style.transform  = 'scale(0.38)'
      envSceneRef.current.style.marginBottom = '-56px'
    }
    setTimeout(() => setAnimDone(true), 300)
  }

  // ── Count-up when animDone and data resolved ─────────────────────────────────
  useEffect(() => {
    if (!animDone || compLoading) return
    const targetYou = mode === 'pct'
      ? Math.min(rval, 50)
      : (prevPrem !== null && prevPrem > 0)
        ? Math.min(calculatePct(rval, prevPrem), 200)
        : 0
    const targetNbr = areaMed !== null ? Math.round(areaMed) : null
    const targetOnt = ontMed  !== null ? Math.round(ontMed)  : null
    const DUR = 1200
    let start: number | null = null

    // Suppress live region announcements during count-up
    ;['cmpYours', 'cmpArea', 'cmpOnt'].forEach(id => {
      const el = document.getElementById(id)
      if (el) el.setAttribute('aria-live', 'off')
    })

    function tick(ts: number) {
      if (!start) start = ts
      const t = easeOutCubic(Math.min((ts - start) / DUR, 1))
      setCntYou(Math.round(t * targetYou))
      if (targetNbr !== null) setCntNbr(Math.round(t * targetNbr))
      if (targetOnt !== null) setCntOnt(Math.round(t * targetOnt))
      if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)

    // Re-enable after count-up so final values are announced
    setTimeout(() => {
      ;['cmpYours', 'cmpArea', 'cmpOnt'].forEach(id => {
        const el = document.getElementById(id)
        if (el) {
          el.setAttribute('aria-live', 'polite')
          el.setAttribute('aria-atomic', 'true')
        }
      })
    }, 1500)
  }, [animDone, compLoading, rval, mode, prevPrem, areaMed, ontMed])

  // ── Delay verify prompt 2800ms after comparison card is ready ──────────────
  useEffect(() => {
    if (!animDone || compLoading) return
    const t = setTimeout(() => setShowVerify(true), 2800)
    return () => clearTimeout(t)
  }, [animDone, compLoading])

  // ── Profiles Like Me discovery card — show once per session ────────────────
  useEffect(() => {
    if (!animDone || compLoading) return
    if (sessionStorage.getItem('rateshock_like_me_shown')) return
    setShowLikeMeCard(true)
  }, [animDone, compLoading])

  // ── Pioneer/early/established copy ──────────────────────────────────────────
  // ── Pioneer moment — chime + shimmer on first appearance ────────────────────
  useEffect(() => {
    if (!animDone || fsaCount >= 5) return
    if (!prefersReducedRef.current) playChime()
    const el = pioneerNameRef.current
    if (el && !prefersReducedRef.current) {
      const onEnd = () => el.classList.remove('pioneer-shimmer')
      el.addEventListener('animationend', onEnd, { once: true })
    }
  }, [animDone])

  const fsaPioneer  = fsaCount === 0
  const fsaEarly    = fsaCount >= 1 && fsaCount <= 9
  // const fsaEstablished = fsaCount >= 10

  const fsaHintIsLoading = fsaCountLoading && fsa.length === 3
  const fsaHint = fsaHintIsLoading
    ? 'Looking up your area…'
    : fsa.length === 3 ? (
        fsaPioneer
          ? `You're the first in ${areaLabel || fsa}. Be a pioneer.`
          : fsaEarly
          ? `${fsaCount} neighbour${fsaCount === 1 ? '' : 's'} in ${areaLabel || fsa} have shared.`
          : `${fsaCount} renewals on the map for ${areaLabel || fsa}.`
      ) : fsa.length >= 1 ? areaLabel : ''
  const fsaHintColor = fsaHintIsLoading ? 'var(--n-400)' : '#4A50B0'

  // ── Comparison card ──────────────────────────────────────────────────────────
  const daysRemaining = 21
  const urgencyText = daysRemaining <= 7
    ? `${daysRemaining} days left to contribute for your area.`
    : `${daysRemaining} days remaining in the current data window. The more neighbours contribute, the clearer the picture becomes.`

  // Whether we have a percentage to compare (pct mode, or dollar mode with prevPrem calculated)
  const hasPct = mode === 'pct' || (mode === 'dol' && prevPrem !== null && prevPrem > 0)
  // Show the "add previous premium" patch card in the success state
  const showPremiumPatch = animDone && dollarAmount !== null && !!submissionId && !patchDone
  const userPctVal = mode === 'pct'
    ? Math.min(rval, 50)
    : (prevPrem !== null && prevPrem > 0)
      ? calculatePct(rval, prevPrem)
      : 0
  const hasAreaData   = areaMed !== null && areaMedCount >= 3
  const hasLimitedData = areaMed !== null && areaMedCount > 0 && areaMedCount < 3
  const nbrAbove      = hasAreaData && hasPct && areaMed! < userPctVal

  // ─── Render ──────────────────────────────────────────────────────────────────
  const stepTitle = step === 1 ? 'Your policy' : step === 2 ? 'Your renewal' : ''
  const label    = sliderLabel(rval, mode)
  const valColor = heroColor(rval, mode)

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* ── Backdrop ── */}
          <motion.div
            key="srm-backdrop"
            style={{ position: 'fixed', inset: 0, background: 'rgba(26,25,23,0.46)', zIndex: 500 /* z-backdrop */ }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={handleClose}
          />

          {/* ── Modal card ── */}
          <motion.div
            key="srm-modal"
            role="dialog"
            aria-modal="true"
            aria-label={stepTitle || 'Submitting renewal'}
            className={isMobile ? 'modal-mobile' : undefined}
            ref={modalRef}
            onKeyDown={handleKeyDown}
            style={isMobile ? {
              position:     'fixed',
              bottom:       0,
              left:         0,
              right:        0,
              top:          'auto',
              width:        '100%',
              margin:       0,
              background:   '#FFFFFF',
              borderRadius: '20px 20px 0 0',
              border:       '1px solid #E2E1DD',
              boxShadow:    '0 8px 32px rgba(26,25,23,.12), 0 2px 8px rgba(26,25,23,.06)',
              zIndex:       600, // z-modal
              display:      'flex',
              flexDirection:'column',
              overflow:     'hidden',
            } : {
              position:     'fixed',
              top:          '50%',
              left:         '50%',
              width:        'calc(100vw - 48px)',
              maxWidth:     468,
              background:   '#FFFFFF',
              borderRadius: 20,
              border:       '1px solid #E2E1DD',
              boxShadow:    '0 8px 32px rgba(26,25,23,.12), 0 2px 8px rgba(26,25,23,.06)',
              zIndex:       600, // z-modal
              display:      'flex',
              flexDirection:'column',
              maxHeight:    'calc(100vh - 48px)',
              overflow:     'hidden',
            }}
            initial={isMobile
              ? { opacity: 0, y: '100%' }
              : { opacity: 0, scale: 0.94, x: '-50%', y: '-52%' }}
            animate={isMobile
              ? { opacity: 1, y: 0 }
              : { opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
            exit={isMobile
              ? { opacity: 0, y: '100%' }
              : { opacity: 0, scale: 0.94, x: '-50%', y: '-52%' }}
            transition={{ type: 'spring', stiffness: 200, damping: 24 }}
          >
            {/* ── Drag handle (mobile only) ── */}
            {isMobile && (
              <div style={{
                width: 36, height: 4, borderRadius: 2,
                background: '#D4D3CE',
                margin: '12px auto 0', display: 'block',
              }} />
            )}

            {/* ── Header ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 22px 0', flexShrink: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 500, color: '#1A1917' }}>{stepTitle}</span>
              <button
                type="button"
                onClick={handleClose}
                style={{
                  width: 26, height: 26, borderRadius: '50%',
                  border: '1px solid #EEEDEA', background: '#FFFFFF',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background .15s', flexShrink: 0, padding: 0,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#F5F4F1')}
                onMouseLeave={e => (e.currentTarget.style.background = '#FFFFFF')}
                aria-label="Close modal"
              >
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                  <path d="M1.5 1.5l8 8M9.5 1.5l-8 8" stroke="#767670" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* ── Dot progress ── */}
            {step !== 'anim' && (
              <div
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 8, padding: '12px 0 0', flexShrink: 0,
                }}
                role="status"
                aria-live="polite"
                aria-label={`Step ${step} of 2`}
                id="dotrow"
              >
                {[1, 2].map(n => (
                  <div
                    key={n}
                    style={{
                      width: step === n ? 18 : 5, height: 5,
                      borderRadius: step === n ? 3 : '50%',
                      background: step === n ? '#1A1917' : '#D4D3CE',
                      transition: 'all .35s cubic-bezier(.16,1,.3,1)',
                    }}
                  />
                ))}
                <span
                  aria-hidden="true"
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 10, fontWeight: 500, letterSpacing: '0.04em',
                    color: 'var(--n-400)', textTransform: 'uppercase', marginLeft: 4,
                  }}
                >
                  {step === 1 ? '1 of 2' : '2 of 2'}
                </span>
              </div>
            )}

            {/* ── Scrollable body ── */}
            {step !== 'anim' && (
              <div style={{
                padding: '16px 22px 0', overflowY: 'auto', flex: 1,
                scrollbarWidth: 'thin', scrollbarColor: '#E2E1DD transparent',
                ...(isMobile ? {
                  maxHeight:                 'calc(92dvh - 140px)',
                  WebkitOverflowScrolling:   'touch',
                  overscrollBehavior:        'contain',
                } : {}),
              }}>

                {/* ════ STEP 1 ════ */}
                {step === 1 && (
                  <div>
                    {/* Draft restore notice */}
                    {showRestoreNotice && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: '#EEEFFA', borderRadius: 8,
                        padding: '8px 12px', marginBottom: 12,
                        fontSize: 12, color: '#4A50B0',
                      }}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                          <circle cx="6" cy="6" r="5" stroke="#4A50B0" strokeWidth="1"/>
                          <path d="M6 3.5v3l1.5 1.5" stroke="#4A50B0" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span style={{ flex: 1 }}>We saved your progress.</span>
                        <button
                          type="button"
                          onClick={() => { setShowRestoreNotice(false); safeSetItem(DRAFT_SHOWN_KEY, 'true') }}
                          style={{ background: 'none', border: 'none', color: '#4A50B0', cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1 }}
                          aria-label="Dismiss"
                        >×</button>
                      </div>
                    )}
                    {/* FSA */}
                    <div style={{ marginBottom: 0 }}>
                      <label htmlFor="fsai" style={LABEL_STYLE}>FSA — First 3 characters of postal code</label>
                      <input
                        id="fsai"
                        type="text"
                        value={fsa}
                        maxLength={3}
                        placeholder="M5V"
                        autoComplete="off"
                        autoCapitalize="characters"
                        autoCorrect="off"
                        spellCheck={false}
                        inputMode="text"
                        aria-invalid={fsaError}
                        onChange={e => onFsaInput(e.target.value)}
                        style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: 22, fontWeight: 500,
                          width: '100%', padding: '11px 15px',
                          border: fsaError ? '1.5px solid #D4503A' : '1.5px solid #EEEDEA',
                          borderRadius: 12, background: '#FFFFFF', color: '#1A1917',
                          outline: 'none', letterSpacing: '.14em', textTransform: 'uppercase',
                          transition: 'border-color .15s, box-shadow .15s', display: 'block',
                        }}
                        onFocus={e => { e.currentTarget.style.borderColor = '#4A50B0'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(74,80,176,.09)' }}
                        onBlur={e => { e.currentTarget.style.borderColor = fsaError ? '#D4503A' : '#EEEDEA'; e.currentTarget.style.boxShadow = 'none' }}
                      />
                      <div style={{ marginTop: 4, marginBottom: 0, minHeight: 32 }}>
                        <AnimatePresence mode="wait">
                          {fsaHint && !fsaError && (
                            <motion.p
                              key={fsaHint}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: prefersReduced ? 0 : 0.12, ease: 'easeInOut' }}
                              style={{
                                fontSize: 12, color: fsaHintColor, fontWeight: 500, margin: 0,
                                lineHeight: 1.4, overflow: 'hidden',
                                display: '-webkit-box', WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                              }}
                            >
                              {fsaHint}
                            </motion.p>
                          )}
                        </AnimatePresence>
                      </div>
                      {fsaError && (
                        <p role="alert" style={{ fontSize: 12, color: '#D4503A', marginTop: 4 }}>
                          Please enter your 3-character FSA to continue
                        </p>
                      )}
                      <p style={{ fontSize: 11, color: 'var(--n-400)', marginTop: 4, marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 5, lineHeight: 1.5 }}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
                          <circle cx="6" cy="6" r="5" stroke="#B8B7B1" strokeWidth="1"/>
                          <path d="M6 5.5v3" stroke="#B8B7B1" strokeWidth="1.2" strokeLinecap="round"/>
                          <circle cx="6" cy="3.75" r=".6" fill="#B8B7B1"/>
                        </svg>
                        Only your 3-character area code is stored. Your exact address is never collected.
                      </p>
                    </div>

                    {/* Insurance type */}
                    <div style={{ marginBottom: 16 }}>
                      <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
                        <legend className="fl">Insurance type</legend>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {(['auto', 'home'] as const).map(t => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setInsType(t)}
                            style={{
                              flex: 1, padding: '11px 8px', borderRadius: 10, fontSize: 13, fontWeight: 500,
                              border: `1.5px solid ${insType === t ? '#1A1917' : '#EEEDEA'}`,
                              background: insType === t ? '#1A1917' : '#FFFFFF',
                              color: insType === t ? '#FFFFFF' : 'var(--n-500)',
                              cursor: 'pointer', transition: 'all .2s cubic-bezier(.16,1,.3,1)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                              fontFamily: "'Inter', system-ui, sans-serif",
                            }}
                          >
                            {t === 'auto' ? (
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                                <rect x="1" y="5" width="14" height="8" rx="2" stroke="currentColor" strokeWidth="1.2"/>
                                <circle cx="4.5" cy="13" r="1.5" fill="currentColor"/>
                                <circle cx="11.5" cy="13" r="1.5" fill="currentColor"/>
                                <path d="M4 5l1.5-3h5L12 5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                              </svg>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                                <path d="M2 7l6-5 6 5v7a1 1 0 01-1 1H3a1 1 0 01-1-1V7z" stroke="currentColor" strokeWidth="1.2"/>
                                <path d="M6 14V9h4v5" stroke="currentColor" strokeWidth="1.2"/>
                              </svg>
                            )}
                            {t === 'auto' ? 'Auto' : 'Home'}
                          </button>
                        ))}
                      </div>
                      </fieldset>
                    </div>

                    {/* Auto fields */}
                    <div style={{
                      overflow: 'hidden', maxHeight: insType === 'auto' ? 300 : 0,
                      opacity: insType === 'auto' ? 1 : 0,
                      transition: 'max-height .5s cubic-bezier(.16,1,.3,1), opacity .35s',
                    }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                        <Stepper s={steppers.yrs} min={0} max={30} label="Years licensed (G)"      onAdj={d => adj('yrs', d)} inputId="yrsv" decreaseLabel="Decrease years licensed"   increaseLabel="Increase years licensed" />
                        <Stepper s={steppers.cl}  min={0} max={5}  label="At-fault claims (6 yrs)" onAdj={d => adj('cl', d)}  inputId="clv"  decreaseLabel="Decrease at-fault claims"  increaseLabel="Increase at-fault claims" />
                      </div>
                      <div style={{ marginBottom: 4 }}>
                        <Stepper s={steppers.cv} min={0} max={3} label="Convictions (last 3 years)" onAdj={d => adj('cv', d)} inputId="cvv" decreaseLabel="Decrease convictions" increaseLabel="Increase convictions" />
                      </div>
                    </div>

                    {/* Home fields */}
                    <div style={{
                      overflow: 'hidden', maxHeight: insType === 'home' ? 120 : 0,
                      opacity: insType === 'home' ? 1 : 0,
                      transition: 'max-height .5s cubic-bezier(.16,1,.3,1), opacity .35s',
                    }}>
                      <div style={{ paddingBottom: 4 }}>
                        <Stepper s={steppers.hcl} min={0} max={5} label="Number of claims" onAdj={d => adj('hcl', d)} inputId="hclv" decreaseLabel="Decrease number of claims" increaseLabel="Increase number of claims" />
                      </div>
                    </div>

                    {/* Provider */}
                    <div style={{ marginBottom: 4, marginTop: 20 }}>
                      <fieldset style={{ border: 'none', padding: 0, margin: 0 }} aria-invalid={provErr}>
                        <legend id="provLegend" className="fl">Your insurance provider</legend>
                        {/* Search input — hidden once a provider is selected */}
                        <input
                          type="search"
                          placeholder="Search providers..."
                          value={provSearch}
                          onChange={e => setProvSearch(e.target.value)}
                          autoComplete="off"
                          style={{
                            display: provSearch === '' && provider ? 'none' : 'block',
                            width: '100%',
                            fontFamily: "'Inter', system-ui, sans-serif",
                            fontSize: 13,
                            padding: '8px 12px',
                            border: '1.5px solid #EEEDEA',
                            borderRadius: 8,
                            background: '#FFFFFF',
                            color: '#1A1917',
                            outline: 'none',
                            marginBottom: 10,
                            boxSizing: 'border-box',
                          }}
                          onFocus={e => { e.target.style.borderColor = '#636AC5'; e.target.style.boxShadow = '0 0 0 3px rgba(74,80,176,.09)' }}
                          onBlur={e => { e.target.style.borderColor = '#EEEDEA'; e.target.style.boxShadow = 'none' }}
                        />
                        <div
                          id="provGrid"
                          role="radiogroup"
                          aria-labelledby="provLegend"
                          onKeyDown={handleProvKeyDown}
                          style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
                        >
                          {(() => {
                            const filtered = PROVIDERS.filter(p =>
                              p.toLowerCase().includes(provSearch.toLowerCase().trim())
                            )
                            if (filtered.length === 0) {
                              return (
                                <p style={{
                                  fontSize: 12, color: 'var(--n-400)', textAlign: 'center',
                                  padding: '8px 0', fontStyle: 'italic', width: '100%', margin: 0,
                                }}>
                                  No providers match &ldquo;{provSearch}&rdquo;
                                </p>
                              )
                            }
                            return filtered.map((p, i) => (
                              <button
                                key={p}
                                type="button"
                                role="radio"
                                aria-checked={provider === p}
                                tabIndex={provider === p ? 0 : (provider === '' && i === 0 ? 0 : -1)}
                                onClick={() => { setProvider(p); setProvErr(false); setProvSearch('') }}
                                style={{
                                  padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 500,
                                  border: `1px solid ${provider === p ? '#1A1917' : '#EEEDEA'}`,
                                  background: provider === p ? '#1A1917' : '#FFFFFF',
                                  color: provider === p ? '#FFFFFF' : 'var(--n-500)',
                                  cursor: 'pointer', transition: 'all .15s',
                                  fontFamily: "'Inter', system-ui, sans-serif",
                                }}
                              >{p}</button>
                            ))
                          })()}
                        </div>
                        {provErr && <p role="alert" style={{ fontSize: 12, color: '#D4503A', marginTop: 4 }}>Please select your provider</p>}
                      </fieldset>
                    </div>
                  </div>
                )}

                {/* ════ STEP 2 ════ */}
                {step === 2 && (
                  <div>
                    {/* Slider */}
                    <div style={{ marginBottom: 16 }}>
                      <label htmlFor="rng" style={LABEL_STYLE}>Premium increase this renewal</label>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                        <div
                          id="slval"
                          aria-live="polite"
                          aria-atomic="true"
                          style={{
                            fontFamily: "'IBM Plex Mono', monospace",
                            fontSize: 'clamp(36px, 8vw, 48px)',
                            fontWeight: 700,
                            letterSpacing: '-0.03em',
                            color: valColor,
                            lineHeight: 1,
                            fontVariantNumeric: 'tabular-nums',
                            transition: 'color 0.15s ease',
                          }}
                        >
                          {formatSliderVal(rval, mode)}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--n-100)', borderRadius: 9999, padding: 2 }}>
                          {(['pct', 'dol'] as const).map(m => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => switchMode(m)}
                              style={{
                                fontFamily: "'IBM Plex Mono', monospace",
                                fontSize: 11, fontWeight: 500,
                                padding: '4px 12px', borderRadius: 9999,
                                border: 'none', cursor: 'pointer',
                                letterSpacing: '0.02em',
                                background: mode === m ? 'var(--n-0)' : 'transparent',
                                color: mode === m ? 'var(--n-900)' : 'var(--n-400)',
                                boxShadow: mode === m ? '0 1px 2px rgba(26,25,23,.08)' : 'none',
                                transition: 'background 0.15s, color 0.15s, box-shadow 0.15s',
                              }}
                            >{m === 'pct' ? '%' : '$'}</button>
                          ))}
                        </div>
                      </div>
                      <input
                        id="rng"
                        className="rng"
                        type="range"
                        min={0}
                        max={mode === 'pct' ? 50 : 2000}
                        step={mode === 'pct' ? 1 : 25}
                        value={rval}
                        aria-label="Premium increase this renewal"
                        aria-valuemin={0}
                        aria-valuemax={mode === 'pct' ? 50 : 2000}
                        aria-valuenow={rval}
                        aria-valuetext={
                          mode === 'pct'
                            ? (rval >= 50 ? '50 percent or more' : `${rval} percent`)
                            : (rval >= 2000 ? '$2000 or more' : `$${rval}`)
                        }
                        onChange={e => onRange(Number(e.target.value))}
                        style={{
                          width: '100%', height: 4, borderRadius: 2, outline: 'none',
                          WebkitAppearance: 'none', cursor: 'pointer', margin: '6px 0', display: 'block',
                          background: trackBg,
                        }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                        <span style={{ fontSize: 11, color: '#B8B7B1', fontFamily: "'IBM Plex Mono', monospace" }}>
                          {mode === 'pct' ? '0%' : '$0'}
                        </span>
                        <span style={{ fontSize: 11, color: '#B8B7B1', fontFamily: "'IBM Plex Mono', monospace" }}>
                          {mode === 'pct' ? '50%+' : '$2,000+'}
                        </span>
                      </div>
                      <p aria-live="polite" aria-atomic="true" style={{ fontSize: 12, color: label.color, marginTop: 6, lineHeight: 1.5 }}>{label.text}</p>
                    </div>

                    {/* Previous premium — dollar mode only */}
                    <AnimatePresence>
                      {mode === 'dol' && (
                        <motion.div
                          key="prevPremWrap"
                          initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                          animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
                          exit={{    opacity: 0, height: 0, marginBottom: 0 }}
                          transition={prefersReduced
                            ? { duration: 0 }
                            : { type: 'spring', stiffness: 240, damping: 24, mass: 1.0 }}
                          style={{ overflow: 'hidden' }}
                        >
                          <label
                            htmlFor="prevPremInput"
                            style={{
                              fontFamily: "'IBM Plex Mono', monospace",
                              fontSize: 10, fontWeight: 500,
                              letterSpacing: '0.06em', textTransform: 'uppercase',
                              color: 'var(--n-400)', display: 'block', marginBottom: 8,
                            }}
                          >
                            Previous annual premium
                            <span
                              aria-hidden="true"
                              style={{
                                fontFamily: "'Inter', system-ui, sans-serif",
                                fontWeight: 400, letterSpacing: 0,
                                textTransform: 'none', fontSize: 11,
                                color: 'var(--n-300)', marginLeft: 6,
                              }}
                            >
                              optional
                            </span>
                          </label>
                          <div
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              background: 'var(--n-0)',
                              border: '1.5px solid var(--n-150)',
                              borderRadius: 10, padding: '0 14px', height: 48,
                              transition: 'border-color .15s, box-shadow .15s',
                            }}
                            onFocusCapture={e => {
                              const el = e.currentTarget as HTMLDivElement
                              el.style.borderColor = 'var(--p-400)'
                              el.style.boxShadow   = '0 0 0 3px rgba(99,106,197,.09)'
                            }}
                            onBlurCapture={e => {
                              const el = e.currentTarget as HTMLDivElement
                              el.style.borderColor = 'var(--n-150)'
                              el.style.boxShadow   = 'none'
                            }}
                          >
                            <span style={{
                              fontFamily: "'IBM Plex Mono', monospace",
                              fontSize: 16, fontWeight: 500,
                              color: 'var(--n-400)', userSelect: 'none', flexShrink: 0,
                            }}>$</span>
                            <input
                              id="prevPremInput"
                              type="number"
                              inputMode="numeric"
                              placeholder="1,800"
                              min={100}
                              max={99999}
                              step={1}
                              autoComplete="off"
                              aria-label="Previous annual premium in dollars, optional"
                              aria-describedby="prevPremHelp"
                              value={prevPrem !== null ? String(prevPrem) : ''}
                              style={{
                                flex: 1,
                                fontFamily: "'IBM Plex Mono', monospace",
                                fontSize: 16, fontWeight: 500,
                                color: 'var(--n-900)',
                                border: 'none', outline: 'none',
                                background: 'transparent', padding: 0,
                              }}
                              onChange={e => {
                                const v = parseInt(e.target.value)
                                setPrevPrem(isNaN(v) ? null : v)
                                if (prevPremError) setPrevPremError('')
                              }}
                            />
                          </div>
                          {prevPremError && (
                            <p
                              role="alert"
                              style={{
                                fontFamily: "'Inter', system-ui, sans-serif",
                                fontSize: 11, color: 'var(--neg-500)',
                                marginTop: 6, lineHeight: 1.4,
                              }}
                            >
                              {prevPremError}
                            </p>
                          )}
                          {!prevPremError && prevPrem !== null && prevPrem > 0 ? (
                            <p
                              id="prevPremHelp"
                              style={{
                                fontFamily: "'IBM Plex Mono', monospace",
                                fontSize: 11, color: 'var(--pos-600)',
                                marginTop: 6, lineHeight: 1.4,
                              }}
                            >
                              ≈ {calculatePct(rval, prevPrem)}% increase — your post will be fully comparable with neighbours
                            </p>
                          ) : (
                            <p
                              id="prevPremHelp"
                              style={{
                                fontFamily: "'Inter', system-ui, sans-serif",
                                fontSize: 11, color: 'var(--n-400)',
                                marginTop: 6, lineHeight: 1.4,
                              }}
                            >
                              Helps us calculate your % increase so your post is fully comparable. Find it on last year's renewal letter.
                            </p>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Sentiment */}
                    <div style={{ marginBottom: 16 }}>
                      <fieldset style={{ border: 'none', padding: 0, margin: 0 }} aria-invalid={sentErr}>
                        <legend className="fl">How do you feel about your renewal?</legend>
                        <div style={{ display: 'flex', gap: 5, marginBottom: 2 }}>
                          {[1, 2, 3, 4, 5].map(n => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => { setSent(n); setSentErr(false) }}
                              style={{
                                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                                padding: '9px 3px', borderRadius: 12, minHeight: 72,
                                border: `1.5px solid ${sent === n ? SC[n] : '#EEEDEA'}`,
                                cursor: 'pointer', transition: 'all .22s cubic-bezier(.16,1,.3,1)',
                                background: sent === n ? SC[n] + '28' : '#FFFFFF',
                                fontFamily: "'Inter', system-ui, sans-serif",
                              }}
                              aria-label={SENT_LABELS[n]}
                              aria-pressed={sent === n}
                            >
                              {n === 1 && <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><title>Very happy face</title><circle cx="17" cy="17" r="15" fill="#3A9B55"/><circle cx="12" cy="14" r="2" fill="white"/><circle cx="22" cy="14" r="2" fill="white"/><path d="M10 21Q17 27 24 21" stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none"/></svg>}
                              {n === 2 && <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><title>Happy face</title><circle cx="17" cy="17" r="15" fill="#93D1A2"/><circle cx="12" cy="14" r="2" fill="#1F6132"/><circle cx="22" cy="14" r="2" fill="#1F6132"/><path d="M12 21Q17 24.5 22 21" stroke="#1F6132" strokeWidth="2.2" strokeLinecap="round" fill="none"/></svg>}
                              {n === 3 && <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><title>Neutral face</title><circle cx="17" cy="17" r="15" fill="#D49316"/><circle cx="12" cy="14" r="2" fill="white"/><circle cx="22" cy="14" r="2" fill="white"/><path d="M12 22L22 22" stroke="white" strokeWidth="2.2" strokeLinecap="round"/></svg>}
                              {n === 4 && <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><title>Sad face</title><circle cx="17" cy="17" r="15" fill="#E87460"/><circle cx="12" cy="14" r="2" fill="white"/><circle cx="22" cy="14" r="2" fill="white"/><path d="M12 24Q17 20 22 24" stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none"/></svg>}
                              {n === 5 && <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><title>Very sad face</title><circle cx="17" cy="17" r="15" fill="#D4503A"/><circle cx="12" cy="13" r="2" fill="white"/><circle cx="22" cy="13" r="2" fill="white"/><path d="M10 24Q17 19 24 24" stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none"/></svg>}
                              <span aria-hidden="true" style={{ fontSize: 10, color: 'var(--n-400)', textAlign: 'center', lineHeight: 1.3 }}>
                                {n === 1 ? <>Very<br/>fair</> : n === 5 ? <>Very<br/>unfair</> : SENT_LABELS[n]}
                              </span>
                            </button>
                          ))}
                        </div>
                        {sentErr && <p role="alert" style={{ fontSize: 12, color: '#D4503A', marginTop: 4 }}>Please select how you feel about your renewal</p>}
                      </fieldset>
                    </div>

                    {/* Note */}
                    <div style={{ marginBottom: 16 }}>
                      <label htmlFor="note" style={LABEL_STYLE}>
                        Additional comments{' '}
                        <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                      </label>
                      <textarea
                        id="note"
                        value={note}
                        maxLength={500}
                        placeholder="What would you want your neighbours to know?"
                        onChange={handleNoteChange}
                        style={{
                          width: '100%', padding: '11px 13px',
                          fontFamily: "'Inter', system-ui, sans-serif", fontSize: 14,
                          border: '1.5px solid #EEEDEA', borderRadius: 12,
                          background: '#FFFFFF', color: '#1A1917', outline: 'none',
                          resize: 'none', lineHeight: 1.6, minHeight: 76,
                          transition: 'border-color .15s, box-shadow .15s', display: 'block',
                        }}
                        onFocus={e => { e.currentTarget.style.borderColor = '#4A50B0'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(74,80,176,.09)' }}
                        onBlur={e => { e.currentTarget.style.borderColor = '#EEEDEA'; e.currentTarget.style.boxShadow = 'none' }}
                      />
                      <div
                        id="cc"
                        aria-live="off"
                        aria-atomic="true"
                        style={{ textAlign: 'right', fontSize: 11, color: '#B8B7B1', marginTop: 4 }}
                      >
                        {note.length} / 500
                      </div>
                    </div>

                    {/* Consent */}
                    <div id="consentRow" style={{ marginBottom: 8 }}>
                      <label htmlFor="consent-input" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          id="consent-input"
                          checked={consent}
                          onChange={() => setConsent(c => !c)}
                          style={{
                            position: 'absolute',
                            width: 1, height: 1,
                            padding: 0, margin: -1,
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            borderWidth: 0,
                          }}
                        />
                        <div
                          aria-hidden="true"
                          style={{
                            width: 18, height: 18, borderRadius: 4,
                            border: consent ? '1.5px solid #1A1917' : '1.5px solid #D4D3CE',
                            background: consent ? '#1A1917' : '#FFFFFF',
                            flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            marginTop: 2, transition: 'all .15s',
                          }}
                        >
                          {consent && (
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true">
                              <path d="M1 4l3 3 5-6" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--n-500)', lineHeight: 1.55, margin: 0 }}>
                          I confirm this information is accurate to the best of my knowledge. I understand my submission will be published anonymously and will never be sold or used for commercial purposes.
                        </p>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ════ ANIMATION STAGE ════ */}
            {step === 'anim' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 22px 24px', flex: 1, overflow: 'hidden' }}>
                {/* Particles wrapper */}
                <div
                  ref={ptcWrapRef}
                  style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', borderRadius: '0 0 20px 20px' }}
                />

                {/* Envelope scene */}
                <div ref={envSceneRef} style={{ position: 'relative', width: 180, height: 118, margin: '70px auto 16px', overflow: 'visible', flexShrink: 0 }}>
                  {/* Z=1 Body */}
                  <svg width="180" height="118" viewBox="0 0 180 118" style={{ position: 'absolute', top: 0, left: 0, zIndex: 1, display: 'block', overflow: 'visible' }} aria-hidden="true">
                    <rect x="0" y="0" width="180" height="118" rx="7" fill="#F0EDE8"/>
                    <polygon points="0,0 0,118 90,68" fill="#E8E4DD"/>
                    <polygon points="180,0 180,118 90,68" fill="#E8E4DD"/>
                    <polygon points="0,118 180,118 90,68" fill="#DED9D3"/>
                    <line x1="0"   y1="0"   x2="90" y2="68" stroke="#CBC8C1" strokeWidth="0.8"/>
                    <line x1="180" y1="0"   x2="90" y2="68" stroke="#CBC8C1" strokeWidth="0.8"/>
                    <line x1="0"   y1="118" x2="90" y2="68" stroke="#CBC8C1" strokeWidth="0.8"/>
                    <line x1="180" y1="118" x2="90" y2="68" stroke="#CBC8C1" strokeWidth="0.8"/>
                    <rect x=".5" y=".5" width="179" height="117" rx="6.5" fill="none" stroke="#D4D3CE" strokeWidth="1"/>
                  </svg>

                  {/* Z=2 Letter */}
                  <div
                    ref={envLetterRef}
                    style={{
                      position: 'absolute', left: 14, right: 14, top: 14, height: 140,
                      background: '#FFFFFF', border: '1px solid #DDDBD6', borderRadius: 4,
                      boxShadow: '0 2px 10px rgba(26,25,23,.1)', zIndex: 2, opacity: 0,
                    }}
                  >
                    <div style={{ padding: '14px 13px 0' }}>
                      {[null, '70%', '50%', null, '70%'].map((w, i) => (
                        <div key={i} style={{ height: 2, background: '#EEEDEA', borderRadius: 1, marginBottom: 10, width: w ?? '100%' }} />
                      ))}
                    </div>
                    <div
                      ref={letterFaceRef}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 10, opacity: 0, transition: 'opacity .4s ease' }}
                    />
                  </div>

                  {/* Z=3 Rip elements */}
                  <div ref={ripLRef} style={{ position: 'absolute', left: 14, right: 14, top: 14, height: 140, background: '#FFFFFF', border: '1px solid #DDDBD6', borderRadius: 4, zIndex: 6, opacity: 0, clipPath: 'inset(0 50% 0 0 round 4px 0 0 4px)' }} />
                  <div ref={ripRRef} style={{ position: 'absolute', left: 14, right: 14, top: 14, height: 140, background: '#FFFFFF', border: '1px solid #DDDBD6', borderRadius: 4, zIndex: 6, opacity: 0, clipPath: 'inset(0 0 0 50% round 0 4px 4px 0)' }} />
                  <div ref={ripCrackRef} style={{ position: 'absolute', left: '50%', width: 2, top: 14, height: 140, marginLeft: -1, background: 'linear-gradient(to bottom,transparent,#E87460 15%,#E87460 85%,transparent)', zIndex: 7, opacity: 0, transform: 'scaleY(0)', transformOrigin: 'top' }} />

                  {/* Z=4 Flap */}
                  <svg
                    ref={envFlapRef}
                    width="180" height="118" viewBox="0 0 180 118"
                    style={{ position: 'absolute', top: 0, left: 0, zIndex: 4, display: 'block', overflow: 'visible' }}
                    aria-hidden="true"
                  >
                    <defs>
                      <filter id="flapShadow" x="-20%" y="-40%" width="140%" height="180%">
                        <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="rgba(26,25,23,0.12)"/>
                      </filter>
                    </defs>
                    <polygon ref={flapPolyRef} points="0,0 180,0 90,68" fill="#ECE9E3"/>
                    <polyline ref={flapEdgeRef} points="0,0 90,68 180,0" fill="none" stroke="#C8C5BE" strokeWidth="0.9" strokeLinejoin="round"/>
                    <line x1="0" y1="0" x2="180" y2="0" stroke="#D4D3CE" strokeWidth="1"/>
                    <g ref={sealGroupRef}>
                      <circle ref={sealCircleRef} cx="90" cy="26" r="18" fill="#D4D3CE"/>
                      <circle cx="90" cy="26" r="12" fill="none" stroke="white" strokeWidth="0.7" opacity="0.35"/>
                      <circle cx="84" cy="20" r="3" fill="white" opacity="0.28"/>
                    </g>
                  </svg>
                </div>

                {/* Success / comparison card */}
                {animDone && (
                  <div ref={amsgRef} style={{ textAlign: 'center', animation: 'fadeUp .45s ease both', width: '100%', paddingBottom: 4 }}>
                    {/* On-map confirmation */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 12 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3A9B55', flexShrink: 0 }} />
                      <span style={{ fontSize: 15, fontWeight: 500, color: '#1A1917' }}>Your renewal is on the map.</span>
                    </div>

                    {/* Urgency note */}
                    <div style={{
                      background: '#FEF6E8', border: '1px solid #FACA6B', borderRadius: 10,
                      padding: '10px 14px', marginBottom: 14, textAlign: 'left',
                    }}>
                      <p style={{ fontSize: 12, color: '#845A0C', lineHeight: 1.55 }}>{urgencyText}</p>
                    </div>

                    {/* Comparison card */}
                    <div style={{
                      border: '1px solid #EEEDEA', borderRadius: 14, overflow: 'hidden', marginBottom: 14,
                    }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
                        {/* You column */}
                        <div style={{ padding: '14px 12px', textAlign: 'center', borderRight: '1px solid #EEEDEA', background: '#FAFAF8' }}>
                          <div id="cmpYours" aria-live="off" style={{ fontSize: 22, fontWeight: 600, color: '#1A1917', letterSpacing: '-.02em', lineHeight: 1.2, marginBottom: 4, fontVariantNumeric: 'tabular-nums' }}>
                            {hasPct ? `${cntYou}%` : `+$${rval.toLocaleString()}`}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--n-400)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>you paid</div>
                          <div style={{ fontSize: 10, color: '#B8B7B1' }}>your renewal</div>
                        </div>
                        {/* Area column */}
                        <div style={{ padding: '14px 12px', textAlign: 'center', borderRight: '1px solid #EEEDEA' }}>
                          <div id="cmpArea" aria-live="off" style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-.02em', lineHeight: 1.2, marginBottom: 4, fontVariantNumeric: 'tabular-nums', color: compLoading ? '#D4D3CE' : (hasLimitedData ? 'var(--n-400)' : (hasAreaData ? '#1A1917' : '#D4D3CE')) }}>
                            {compLoading ? '–' : hasAreaData ? `${cntNbr}%` : hasLimitedData ? `${Math.round(areaMed!)}%*` : '–'}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--n-400)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>your area</div>
                          <div style={{ fontSize: 10, color: '#B8B7B1' }}>
                            {compLoading ? 'loading…' : hasAreaData ? 'area median' : hasLimitedData ? 'limited data' : 'no area data yet'}
                          </div>
                        </div>
                        {/* Ontario column */}
                        <div style={{ padding: '14px 12px', textAlign: 'center' }}>
                          <div id="cmpOnt" aria-live="off" style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-.02em', lineHeight: 1.2, marginBottom: 4, fontVariantNumeric: 'tabular-nums', color: compLoading || ontMed === null ? '#D4D3CE' : '#1A1917' }}>
                            {compLoading ? '–' : ontMed !== null ? `${cntOnt}%` : '–'}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--n-400)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>ontario</div>
                          <div style={{ fontSize: 10, color: '#B8B7B1' }}>province-wide</div>
                        </div>
                      </div>
                      {!compLoading && !hasPct && (
                        <div style={{ padding: '10px 14px', borderTop: '1px solid #EEEDEA', background: '#FAFAF8' }}>
                          <p style={{ fontSize: 12, color: 'var(--n-500)', lineHeight: 1.5 }}>
                            Add your previous premium above to see how you compare as a percentage with your neighbours.
                          </p>
                        </div>
                      )}
                      {hasAreaData && hasPct && !compLoading && (
                        <div style={{ padding: '10px 14px', borderTop: '1px solid #EEEDEA', background: '#FAFAF8' }}>
                          <p style={{ fontSize: 12, color: 'var(--n-500)', lineHeight: 1.5 }}>
                            {nbrAbove ? (
                              <><strong style={{ fontWeight: 600, color: '#1A1917' }}>{provider || 'Other'} customers in your area are typically seeing lower increases.</strong>{' '}Yours is on the higher end — worth a closer look.</>
                            ) : (
                              <><strong style={{ fontWeight: 600, color: '#1A1917' }}>Your renewal is at or below the {areaLabel || fsa} average.</strong></>
                            )}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Premium patch card — dollar-mode submissions without prevPrem */}
                    <AnimatePresence>
                      {(showPremiumPatch || patchDone) && submissionId && (
                        <motion.div
                          key="premiumPatchCard"
                          role="region"
                          aria-label="Add previous premium to unlock comparisons"
                          initial={{ opacity: 0, y: 8, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.97 }}
                          transition={prefersReduced
                            ? { duration: 0 }
                            : { type: 'spring', stiffness: 240, damping: 24, mass: 1.0, delay: 0.3 }}
                          style={{
                            background: 'var(--p-50)', border: '1px solid var(--p-200)',
                            borderRadius: 12, padding: '14px 16px',
                            marginBottom: 14, textAlign: 'left',
                            transformOrigin: 'top center',
                          }}
                        >
                          {patchDone ? (
                            /* ── Success state ── */
                            <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                                <circle cx="8" cy="8" r="7" stroke="var(--pos-600)" strokeWidth="1.3"/>
                                <path d="M5 8l2.5 2.5L11 5.5" stroke="var(--pos-600)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--pos-600)', fontFamily: "'Inter', system-ui, sans-serif" }}>
                                Done — your post is now fully comparable with percentage data.
                              </span>
                            </div>
                          ) : (
                            /* ── Default / input state ── */
                            <>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
                                  <rect x="2" y="1.5" width="12" height="13" rx="2" stroke="#4A50B0" strokeWidth="1.2"/>
                                  <path d="M5 5h6M5 8h6M5 11h3" stroke="#4A50B0" strokeWidth="1.2" strokeLinecap="round"/>
                                </svg>
                                <div>
                                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--p-600)', marginBottom: 3, fontFamily: "'Inter', system-ui, sans-serif" }}>
                                    Unlock neighbourhood comparisons
                                  </div>
                                  <div id="patchHelper" style={{ fontSize: 12, color: 'var(--p-500)', lineHeight: 1.5, fontFamily: "'Inter', system-ui, sans-serif" }}>
                                    You submitted a dollar amount. Add your previous premium and we'll calculate your % increase — making your post fully comparable.
                                  </div>
                                </div>
                              </div>
                              <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                <div
                                  style={{
                                    flex: 1, display: 'flex', alignItems: 'center',
                                    background: 'var(--n-0)',
                                    border: '1.5px solid var(--p-200)',
                                    borderRadius: 8, padding: '0 12px', height: 40,
                                    transition: 'border-color .15s, box-shadow .15s',
                                  }}
                                  onFocusCapture={e => {
                                    const el = e.currentTarget as HTMLDivElement
                                    el.style.borderColor = 'var(--p-400)'
                                    el.style.boxShadow   = '0 0 0 3px rgba(99,106,197,.09)'
                                  }}
                                  onBlurCapture={e => {
                                    const el = e.currentTarget as HTMLDivElement
                                    el.style.borderColor = 'var(--p-200)'
                                    el.style.boxShadow   = 'none'
                                  }}
                                >
                                  <span style={{
                                    fontFamily: "'IBM Plex Mono', monospace",
                                    fontSize: 14, fontWeight: 500,
                                    color: 'var(--n-400)', marginRight: 4, flexShrink: 0,
                                  }}>$</span>
                                  <input
                                    id="patchPrevPrem"
                                    ref={patchInputRef}
                                    type="number"
                                    inputMode="numeric"
                                    placeholder="1,800"
                                    min={100}
                                    max={99999}
                                    disabled={patchLoading}
                                    aria-label="Your previous annual premium in dollars"
                                    aria-describedby="patchHelper"
                                    onChange={() => { if (patchError) setPatchError('') }}
                                    style={{
                                      flex: 1,
                                      fontFamily: "'IBM Plex Mono', monospace",
                                      fontSize: 14, fontWeight: 500,
                                      color: 'var(--n-900)',
                                      border: 'none', outline: 'none',
                                      background: 'transparent', padding: 0,
                                    }}
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={handlePatch}
                                  disabled={patchLoading}
                                  aria-busy={patchLoading}
                                  aria-label={patchLoading ? 'Calculating…' : 'Calculate percentage'}
                                  style={{
                                    height: 40, padding: '0 16px', borderRadius: 8,
                                    background: 'var(--p-600)', color: 'var(--n-0)',
                                    fontSize: 13, fontWeight: 500,
                                    border: 'none', cursor: patchLoading ? 'default' : 'pointer',
                                    whiteSpace: 'nowrap', flexShrink: 0,
                                    fontFamily: "'Inter', system-ui, sans-serif",
                                    transition: 'background .15s, transform .1s',
                                    opacity: patchLoading ? 0.65 : 1,
                                  }}
                                  onMouseEnter={e => { if (!patchLoading) (e.currentTarget as HTMLButtonElement).style.background = 'var(--p-700)' }}
                                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'var(--p-600)'}
                                  onMouseDown={e => { if (!patchLoading) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.97)' }}
                                  onMouseUp={e => (e.currentTarget as HTMLButtonElement).style.transform = ''}
                                >
                                  {patchLoading ? 'Saving…' : 'Calculate %'}
                                </button>
                              </div>
                              {patchError && (
                                <p role="alert" aria-live="assertive" style={{
                                  fontSize: 11, color: 'var(--neg-500)',
                                  marginTop: 6, lineHeight: 1.4,
                                  fontFamily: "'Inter', system-ui, sans-serif",
                                }}>
                                  {patchError}
                                </p>
                              )}
                            </>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Zoom to my post link — only shown if FSA has a centroid */}
                    {getCentroid(fsa.toUpperCase()) && (
                      <div style={{ display: 'flex', justifyContent: 'center', margin: '8px auto 12px' }}>
                        <button
                          type="button"
                          onClick={() => { handleClose(); onZoomToPost?.(fsa.toUpperCase()) }}
                          style={{
                            fontFamily: "'IBM Plex Mono', monospace",
                            fontSize: 11, fontWeight: 500,
                            color: 'var(--n-400)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 4,
                            background: 'none', border: 'none', padding: 0,
                            transition: 'color 150ms',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#5E5D56')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--n-400)')}
                          onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
                          onMouseUp={e => (e.currentTarget.style.transform = '')}
                        >
                          Zoom to my post
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                            <path d="M1 9L9 1M9 1H3M9 1v6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>
                    )}

                    {/* Area report link */}
                    <div style={{ display: 'flex', justifyContent: 'center', margin: '-4px auto 12px' }}>
                      <a
                        href={`/area/${fsa.toLowerCase()}`}
                        style={{
                          display: 'block',
                          fontSize: 12,
                          fontWeight: 500,
                          color: '#3A3F8F',
                          textDecoration: 'none',
                          marginTop: 6,
                          fontFamily: "'Inter', system-ui, sans-serif",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                        onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                      >
                        See your area&apos;s full report →
                      </a>
                    </div>

                    {/* Profiles Like Me discovery card */}
                    {showLikeMeCard && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ type: 'spring', stiffness: 240, damping: 24, mass: 1, delay: 0.3 }}
                        style={{
                          background:   '#EEEFFA',
                          border:       '1px solid #B0B4E6',
                          borderRadius: 10,
                          padding:      '12px 14px',
                          margin:       '10px 0',
                          display:      'flex',
                          alignItems:   'flex-start',
                          gap:          10,
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
                          <circle cx="6" cy="4" r="2.5" stroke="#4A50B0" strokeWidth="1.2"/>
                          <circle cx="11" cy="5" r="2" stroke="#4A50B0" strokeWidth="1.2"/>
                          <path d="M1 13c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="#4A50B0" strokeWidth="1.2" strokeLinecap="round"/>
                          <path d="M11 9c1.7.4 3 1.9 3 3.5" stroke="#4A50B0" strokeWidth="1.2" strokeLinecap="round"/>
                        </svg>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#3A3F8F', marginBottom: 3, fontFamily: "'Inter', system-ui, sans-serif" }}>
                            Filter the map to drivers like you
                          </div>
                          <div style={{ fontSize: 12, color: '#4A50B0', lineHeight: 1.5, fontFamily: "'Inter', system-ui, sans-serif" }}>
                            See how your renewal compares to drivers with a similar profile and provider.
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              sessionStorage.setItem('rateshock_like_me_shown', 'true')
                              onEnableLikeMe?.()
                              handleClose()
                            }}
                            style={{
                              display:        'inline-flex',
                              alignItems:     'center',
                              gap:            4,
                              marginTop:      8,
                              fontSize:       12,
                              fontWeight:     500,
                              color:          '#3A3F8F',
                              background:     'none',
                              border:         'none',
                              cursor:         'pointer',
                              padding:        0,
                              fontFamily:     "'Inter', system-ui, sans-serif",
                            }}
                            onMouseEnter={e => (e.currentTarget.style.color = '#2D3170')}
                            onMouseLeave={e => (e.currentTarget.style.color = '#3A3F8F')}
                          >
                            Try it on the map →
                          </button>
                        </div>
                      </motion.div>
                    )}

                    {/* Pioneer moment */}
                    {fsaCount < 5 && (
                      <div style={{
                        background: '#EEEFFA', border: '1px solid #B0B4E6',
                        borderRadius: 10, padding: '10px 14px', marginBottom: 14, textAlign: 'left',
                      }}>
                        <p style={{ fontSize: 12, color: '#2D3170', lineHeight: 1.55, margin: 0, fontWeight: 500 }}>
                          {'You just put '}
                          <strong
                            ref={pioneerNameRef as React.Ref<HTMLElement>}
                            className={!prefersReduced ? 'pioneer-shimmer' : undefined}
                          >
                            {areaLabel || fsa}
                          </strong>
                          {' on the map.'}
                        </p>
                      </div>
                    )}

                    {/* Verify prompt — appears 2800ms after comparison card */}
                    {showVerify && <div style={{ marginBottom: 4 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: '#1A1917', marginBottom: 6 }}>
                        Add your letter. Make it official.
                      </p>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={onVerify}
                          style={{
                            fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13, fontWeight: 500,
                            padding: '9px 20px', borderRadius: 999,
                            border: 'none', background: '#1A1917', color: '#FFFFFF',
                            cursor: 'pointer', transition: 'opacity .15s',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.opacity = '.82')}
                          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                        >Verify my renewal</button>
                        <button
                          type="button"
                          onClick={handleClose}
                          style={{
                            fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13, fontWeight: 500,
                            padding: '6px 16px', borderRadius: 9999,
                            border: 'none', background: 'none', color: 'var(--n-400)',
                            cursor: 'pointer', transition: 'background .15s, color .15s',
                            display: 'block', width: '100%', textAlign: 'center',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#F5F4F1'; e.currentTarget.style.color = '#5E5D56' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--n-400)' }}
                          onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.97)' }}
                          onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = '' }}
                        >Skip for now</button>
                      </div>
                    </div>}
                  </div>
                )}
              </div>
            )}

            {/* ── Footer ── */}
            {step !== 'anim' && (
              <div style={{
                padding: '14px 22px 18px', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0,
                ...(isMobile ? {
                  position:      'sticky',
                  bottom:        0,
                  background:    '#FFFFFF',
                  paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
                } : {}),
              }}>
                {step === 2 && (
                  <button
                    type="button"
                    onClick={goBack}
                    style={{
                      fontFamily: "'Inter', system-ui, sans-serif", fontSize: 14, fontWeight: 500,
                      padding: '11px 18px', borderRadius: 999,
                      border: '1px solid #D4D3CE', background: '#FFFFFF', cursor: 'pointer',
                      color: 'var(--n-500)', transition: 'background .15s, transform .1s', whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#F5F4F1')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#FFFFFF')}
                  >Back</button>
                )}
                <button
                  type="button"
                  onClick={goNext}
                  disabled={step === 2 && !consent}
                  title={step === 2 && !consent ? 'Please confirm the consent statement above' : undefined}
                  onMouseDown={() => {
                    if (step === 2 && !consent) {
                      const row = document.getElementById('consentRow')
                      if (!row) return
                      row.style.transition = 'background .15s'
                      row.style.background = '#FEF6E8'
                      setTimeout(() => { row.style.background = '' }, 600)
                    }
                  }}
                  style={{
                    fontFamily: "'Inter', system-ui, sans-serif", fontSize: 14, fontWeight: 500,
                    padding: '11px 0', borderRadius: 999,
                    border: 'none',
                    background: step === 2 && !consent ? '#D4D3CE' : '#1A1917',
                    color: '#FFFFFF', cursor: step === 2 && !consent ? 'not-allowed' : 'pointer',
                    transition: 'opacity .15s, transform .1s', flex: 1, textAlign: 'center', display: 'block',
                    opacity: submitting ? 0.6 : 1,
                  }}
                  onMouseEnter={e => { if (!(step === 2 && !consent)) e.currentTarget.style.opacity = '.83' }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = submitting ? '0.6' : '1' }}
                >
                  {submitting ? 'Posting…' : step === 2 ? 'Post renewal' : 'Continue'}
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
