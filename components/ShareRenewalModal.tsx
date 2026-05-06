'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { getAreaLabel } from '@/lib/fsaData'
import { getFsaCount } from '@/lib/fsaCounts'
import { supabase } from '@/lib/supabase'
import { setNavState } from '@/components/Nav'
import type { Submission } from '@/lib/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const SC = ['', '#3A9B55', '#93D1A2', '#D49316', '#E87460', '#D4503A']
const SENT_LABELS = ['', 'Very fair', 'Fair', 'Neutral', 'Unfair', 'Very unfair']
const ONTARIO_AVG = 14 // province-wide placeholder %

const PROVIDERS = [
  'Intact', 'Aviva', 'TD Insurance', 'Desjardins', 'Belairdirect',
  'CAA Insurance', 'Economical', 'Wawanesa', 'Travelers', 'Co-operators',
  'Gore Mutual', 'Sonnet', 'Allstate', 'Other',
]

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
  const pct = mode === 'pct' ? val : (val / 2000) * 50
  if (pct <= 4)  return { text: 'Below average · Most Ontario renewals are higher', color: '#9A998F' }
  if (pct <= 9)  return { text: 'Around the Ontario average', color: '#9A998F' }
  if (pct <= 16) return { text: 'Above the Ontario average', color: '#AD7710' }
  if (pct <= 24) return { text: 'Significantly above average', color: '#AD7710' }
  if (pct <= 34) return { text: 'Well above average · Worth verifying this', color: '#B33C28' }
  return { text: 'Exceptionally high — this should definitely be verified', color: '#B33C28' }
}

function formatSliderVal(val: number, mode: 'pct' | 'dol'): string {
  if (mode === 'pct') return val >= 50 ? '50%+' : `${val}%`
  return val >= 2000 ? '$2,000+' : `$${val.toLocaleString()}`
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const LABEL_STYLE: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 500, color: '#9A998F',
  marginBottom: 6, letterSpacing: '.04em', textTransform: 'uppercase',
}

const SB_STYLE: React.CSSProperties = {
  width: 34, height: 34, border: 'none', background: '#FFFFFF',
  cursor: 'pointer', fontSize: 17, color: '#9A998F',
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
}

// ─── Stepper component ────────────────────────────────────────────────────────

function Stepper({
  s, min, max, label, onAdj,
}: {
  s: StepperVal
  min: number
  max: number
  label: string
  onAdj: (d: 1 | -1) => void
}) {
  const displayVal = `${s.v}${s.v === max ? '+' : ''}`
  const anim = s.k > 0
    ? `${s.dir === 'up' ? 'snUp' : 'snDown'} 180ms ease both`
    : undefined

  return (
    <div>
      <label style={LABEL_STYLE}>{label}</label>
      <div style={{
        display: 'flex', alignItems: 'center',
        border: '1px solid #EEEDEA', borderRadius: 10,
        overflow: 'hidden', width: 'fit-content',
      }}>
        <button
          type="button"
          onClick={() => onAdj(-1)}
          disabled={s.v <= min}
          style={{ ...SB_STYLE, opacity: s.v <= min ? 0.4 : 1 }}
        >−</button>
        <span
          key={s.k}
          style={{
            minWidth: 40, textAlign: 'center', fontSize: 14, fontWeight: 500,
            color: '#1A1917', borderLeft: '1px solid #EEEDEA',
            borderRight: '1px solid #EEEDEA', lineHeight: '34px',
            background: '#FFFFFF', display: 'block',
            animation: anim,
          }}
        >{displayVal}</span>
        <button
          type="button"
          onClick={() => onAdj(1)}
          disabled={s.v >= max}
          style={{ ...SB_STYLE, opacity: s.v >= max ? 0.4 : 1 }}
        >+</button>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ShareRenewalModal({ isOpen, onClose, onVerify, onSubmitted }: ShareRenewalModalProps) {
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
    yrs: { v: 5, k: 0, dir: 'up' }, cl:  { v: 0, k: 0, dir: 'up' },
    cv:  { v: 0, k: 0, dir: 'up' }, hyr: { v: 3, k: 0, dir: 'up' },
    hcl: { v: 0, k: 0, dir: 'up' },
  })
  const [mode, setMode]           = useState<'pct' | 'dol'>('pct')
  const [rval, setRval]           = useState(12)
  const [trackBg, setTrackBg]     = useState('linear-gradient(to right,#1A1917 24%,#D4D3CE 24%)')
  const [sent, setSent]           = useState(0)
  const [sentErr, setSentErr]     = useState(false)
  const [note, setNote]           = useState('')
  const [consent, setConsent]     = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // ── post-anim state ─────────────────────────────────────────────────────────
  const [animDone, setAnimDone]           = useState(false)
  const [neighbourAvg, setNeighbourAvg]   = useState<number | null>(null)
  const [cntYou, setCntYou]               = useState(0)
  const [cntNbr, setCntNbr]               = useState(0)
  const [cntOnt, setCntOnt]               = useState(0)

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
  const rafRef        = useRef<number>(0)

  // ── update track background ─────────────────────────────────────────────────
  const updateTrack = useCallback((v: number, mn: number, mx: number) => {
    const p = Math.round(((v - mn) / (mx - mn)) * 100)
    setTrackBg(`linear-gradient(to right,#1A1917 ${p}%,#D4D3CE ${p}%)`)
  }, [])

  // ── reset ───────────────────────────────────────────────────────────────────
  const resetAll = useCallback(() => {
    setStep(1); setFsa(''); setFsaError(false); setAreaLabel(''); setFsaCount(0)
    setInsType('auto'); setProvider(''); setProvErr(false)
    setSteppers({
      yrs: { v: 5, k: 0, dir: 'up' }, cl:  { v: 0, k: 0, dir: 'up' },
      cv:  { v: 0, k: 0, dir: 'up' }, hyr: { v: 3, k: 0, dir: 'up' },
      hcl: { v: 0, k: 0, dir: 'up' },
    })
    setMode('pct'); setRval(12); updateTrack(12, 0, 50)
    setSent(0); setSentErr(false); setNote(''); setConsent(false)
    setSubmitting(false); setAnimDone(false)
    setNeighbourAvg(null); setCntYou(0); setCntNbr(0); setCntOnt(0)

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
  function onFsaInput(val: string) {
    const v = val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3)
    setFsa(v)
    setFsaError(false)
    setAreaLabel(v.length >= 1 ? getAreaLabel(v) : '')
    setFsaCount(v.length === 3 ? getFsaCount(v) : 0)
  }

  // ── Stepper adjust ──────────────────────────────────────────────────────────
  const cfg: Record<string, { min: number; max: number }> = {
    yrs: { min: 0, max: 30 }, cl:  { min: 0, max: 5 },
    cv:  { min: 0, max: 3  }, hyr: { min: 0, max: 30 },
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
    const mn = mode === 'pct' ? 0 : 0
    const mx = mode === 'pct' ? 50 : 2000
    updateTrack(v, mn, mx)
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
    setSubmitting(true)
    const payload = {
      fsa: fsa.toUpperCase(),
      neighbourhood: getAreaLabel(fsa),
      insurance_type: insType,
      provider,
      rate_change_pct:    mode === 'pct' ? rval : null,
      rate_change_dollar: mode === 'dol' ? rval : null,
      mode: mode === 'dol' ? 'dollar' : 'pct',
      years_licensed:  insType === 'auto' ? steppers.yrs.v : null,
      at_fault_claims: insType === 'auto' ? steppers.cl.v  : 0,
      convictions:     insType === 'auto' ? steppers.cv.v  : 0,
      home_claims:     insType === 'home' ? steppers.hcl.v : 0,
      sentiment: sent,
      comment_raw: note || null,
    }

    // Build optimistic submission for the map — shown immediately without waiting for DB
    const optimisticSub: Submission = {
      id:              crypto.randomUUID(),
      fsa:             fsa.toUpperCase(),
      provider,
      insurance_type:  insType,
      rate_change_pct: mode === 'pct' ? rval : null,
      sentiment:       sent,
      verified:        false,
      created_at:      new Date().toISOString(),
    }

    // Fire-and-forget write; don't block the animation
    supabase.from('submissions').insert(payload).then(async () => {
      // Fetch aggregate for comparison card
      const { data } = await supabase
        .from('submissions')
        .select('rate_change_pct')
        .eq('fsa', fsa.toUpperCase())
        .eq('insurance_type', insType)
        .not('rate_change_pct', 'is', null)
      if (data && data.length >= 5) {
        const avg = data.reduce((s: number, r: { rate_change_pct: number }) => s + r.rate_change_pct, 0) / data.length
        setNeighbourAvg(Math.round(avg))
      }
    })

    // Update nav state and surface the submission to the map immediately
    setNavState('unverified')
    onSubmitted?.(optimisticSub)

    setStep('anim')
    setSubmitting(false)
    setTimeout(() => playAnim(), 50)
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

  // ── Count-up when animDone ───────────────────────────────────────────────────
  useEffect(() => {
    if (!animDone) return
    const targetYou = mode === 'pct' ? Math.min(rval, 50) : Math.round((rval / 2000) * 50)
    const targetNbr = neighbourAvg ?? null
    const targetOnt = ONTARIO_AVG
    const DUR = 1200
    let start: number | null = null

    function tick(ts: number) {
      if (!start) start = ts
      const t = easeOutCubic(Math.min((ts - start) / DUR, 1))
      setCntYou(Math.round(t * targetYou))
      if (targetNbr !== null) setCntNbr(Math.round(t * targetNbr))
      setCntOnt(Math.round(t * targetOnt))
      if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [animDone, rval, mode, neighbourAvg])

  // ── Pioneer/early/established copy ──────────────────────────────────────────
  const fsaPioneer  = fsaCount === 0
  const fsaEarly    = fsaCount >= 1 && fsaCount <= 9
  // const fsaEstablished = fsaCount >= 10

  const fsaHint = fsa.length === 3 ? (
    fsaPioneer
      ? `You're the first in ${areaLabel || fsa}. Be a pioneer.`
      : fsaEarly
      ? `${fsaCount} neighbour${fsaCount === 1 ? '' : 's'} in ${areaLabel || fsa} have shared.`
      : `${fsaCount} renewals on the map for ${areaLabel || fsa}.`
  ) : fsa.length >= 1 ? areaLabel : ''

  // ── Comparison card ──────────────────────────────────────────────────────────
  const daysRemaining = 21
  const urgencyText = daysRemaining <= 7
    ? `${daysRemaining} days left to contribute for your area.`
    : `${daysRemaining} days remaining in the current data window. The more neighbours contribute, the clearer the picture becomes.`

  const userPctVal = mode === 'pct' ? Math.min(rval, 50) : Math.round((rval / 2000) * 50)
  const hasNbrData = neighbourAvg !== null && (getFsaCount(fsa) >= 5)
  const nbrAbove   = hasNbrData && neighbourAvg! < userPctVal

  // ─── Render ──────────────────────────────────────────────────────────────────
  const stepTitle = step === 1 ? 'Your policy' : step === 2 ? 'Your renewal' : ''
  const label = sliderLabel(rval, mode)

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* ── Backdrop ── */}
          <motion.div
            key="srm-backdrop"
            style={{ position: 'fixed', inset: 0, background: 'rgba(26,25,23,0.46)', zIndex: 400 }}
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
            style={{
              position: 'fixed',
              top: '50%', left: '50%',
              width: 'calc(100vw - 48px)',
              maxWidth: 468,
              background: '#FFFFFF',
              borderRadius: 20,
              border: '1px solid #E2E1DD',
              boxShadow: '0 8px 32px rgba(26,25,23,.12), 0 2px 8px rgba(26,25,23,.06)',
              zIndex: 500,
              display: 'flex',
              flexDirection: 'column',
              maxHeight: 'calc(100vh - 48px)',
              overflow: 'hidden',
            }}
            initial={{ opacity: 0, scale: 0.94, x: '-50%', y: '-52%' }}
            animate={{ opacity: 1, scale: 1,    x: '-50%', y: '-50%' }}
            exit={{   opacity: 0, scale: 0.94,  x: '-50%', y: '-52%' }}
            transition={{ type: 'spring', stiffness: 200, damping: 24 }}
          >
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
                aria-label="Close"
              >
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                  <path d="M1.5 1.5l8 8M9.5 1.5l-8 8" stroke="#9A998F" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* ── Dot progress ── */}
            {step !== 'anim' && (
              <div style={{ display: 'flex', gap: 5, justifyContent: 'center', padding: '12px 0 0', flexShrink: 0 }}>
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
              </div>
            )}

            {/* ── Scrollable body ── */}
            {step !== 'anim' && (
              <div style={{
                padding: '16px 22px 0', overflowY: 'auto', flex: 1,
                scrollbarWidth: 'thin', scrollbarColor: '#E2E1DD transparent',
              }}>

                {/* ════ STEP 1 ════ */}
                {step === 1 && (
                  <div>
                    {/* FSA */}
                    <div style={{ marginBottom: 16 }}>
                      <label style={LABEL_STYLE}>FSA — First 3 characters of postal code</label>
                      <input
                        type="text"
                        value={fsa}
                        maxLength={3}
                        placeholder="M5V"
                        autoComplete="off"
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
                      {fsaHint && !fsaError && (
                        <p style={{ fontSize: 12, color: '#4A50B0', fontWeight: 500, marginTop: 5, minHeight: 16 }}>
                          {fsaHint}
                        </p>
                      )}
                      {fsaError && (
                        <p style={{ fontSize: 12, color: '#D4503A', marginTop: 4 }}>
                          Please enter your 3-character FSA to continue
                        </p>
                      )}
                      <p style={{ fontSize: 11, color: '#9A998F', marginTop: 6, display: 'flex', alignItems: 'flex-start', gap: 5, lineHeight: 1.5 }}>
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
                      <label style={LABEL_STYLE}>Insurance type</label>
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
                              color: insType === t ? '#FFFFFF' : '#7C7B72',
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
                    </div>

                    {/* Auto fields */}
                    <div style={{
                      overflow: 'hidden', maxHeight: insType === 'auto' ? 300 : 0,
                      opacity: insType === 'auto' ? 1 : 0,
                      transition: 'max-height .5s cubic-bezier(.16,1,.3,1), opacity .35s',
                    }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                        <Stepper s={steppers.yrs} min={0} max={30} label="Years licensed (G)"      onAdj={d => adj('yrs', d)} />
                        <Stepper s={steppers.cl}  min={0} max={5}  label="At-fault claims (6 yrs)" onAdj={d => adj('cl', d)} />
                      </div>
                      <div style={{ marginBottom: 4 }}>
                        <Stepper s={steppers.cv} min={0} max={3} label="Convictions (last 3 years)" onAdj={d => adj('cv', d)} />
                      </div>
                    </div>

                    {/* Home fields */}
                    <div style={{
                      overflow: 'hidden', maxHeight: insType === 'home' ? 120 : 0,
                      opacity: insType === 'home' ? 1 : 0,
                      transition: 'max-height .5s cubic-bezier(.16,1,.3,1), opacity .35s',
                    }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingBottom: 4 }}>
                        <Stepper s={steppers.hyr} min={0} max={30} label="Years continuously insured" onAdj={d => adj('hyr', d)} />
                        <Stepper s={steppers.hcl} min={0} max={5}  label="Number of claims"           onAdj={d => adj('hcl', d)} />
                      </div>
                    </div>

                    {/* Provider */}
                    <div style={{ marginBottom: 4 }}>
                      <label style={LABEL_STYLE}>Insurance provider</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {PROVIDERS.map(p => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => { setProvider(p); setProvErr(false) }}
                            style={{
                              padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 500,
                              border: `1px solid ${provider === p ? '#1A1917' : '#EEEDEA'}`,
                              background: provider === p ? '#1A1917' : '#FFFFFF',
                              color: provider === p ? '#FFFFFF' : '#7C7B72',
                              cursor: 'pointer', transition: 'all .15s',
                              fontFamily: "'Inter', system-ui, sans-serif",
                            }}
                          >{p}</button>
                        ))}
                      </div>
                      {provErr && <p style={{ fontSize: 12, color: '#D4503A', marginTop: 4 }}>Please select your provider</p>}
                    </div>
                  </div>
                )}

                {/* ════ STEP 2 ════ */}
                {step === 2 && (
                  <div>
                    {/* Slider */}
                    <div style={{ marginBottom: 16 }}>
                      <label style={LABEL_STYLE}>Premium increase this renewal</label>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <span style={{ fontSize: 28, fontWeight: 600, color: '#1A1917', letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }}>
                          {formatSliderVal(rval, mode)}
                        </span>
                        <div style={{ display: 'flex', background: '#F5F4F1', borderRadius: 8, padding: 2 }}>
                          {(['pct', 'dol'] as const).map(m => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => switchMode(m)}
                              style={{
                                padding: '4px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                                border: 'none', cursor: 'pointer', color: mode === m ? '#1A1917' : '#9A998F',
                                background: mode === m ? '#FFFFFF' : 'transparent',
                                boxShadow: mode === m ? '0 1px 2px rgba(0,0,0,.08)' : 'none',
                                transition: 'all .15s', fontFamily: "'Inter', system-ui, sans-serif",
                              }}
                            >{m === 'pct' ? '%' : '$'}</button>
                          ))}
                        </div>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={mode === 'pct' ? 50 : 2000}
                        step={mode === 'pct' ? 1 : 25}
                        value={rval}
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
                      <p style={{ fontSize: 12, color: label.color, marginTop: 6, lineHeight: 1.5 }}>{label.text}</p>
                    </div>

                    {/* Sentiment */}
                    <div style={{ marginBottom: 16 }}>
                      <label style={LABEL_STYLE}>How do you feel about your renewal?</label>
                      <div style={{ display: 'flex', gap: 5, marginBottom: 2 }}>
                        {[1, 2, 3, 4, 5].map(n => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => { setSent(n); setSentErr(false) }}
                            style={{
                              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                              padding: '9px 3px', borderRadius: 12,
                              border: `1.5px solid ${sent === n ? SC[n] : '#EEEDEA'}`,
                              cursor: 'pointer', transition: 'all .22s cubic-bezier(.16,1,.3,1)',
                              background: sent === n ? SC[n] + '28' : '#FFFFFF',
                              fontFamily: "'Inter', system-ui, sans-serif",
                            }}
                            aria-label={SENT_LABELS[n]}
                          >
                            {n === 1 && <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="15" fill="#3A9B55"/><circle cx="12" cy="14" r="2" fill="white"/><circle cx="22" cy="14" r="2" fill="white"/><path d="M10 21Q17 27 24 21" stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none"/></svg>}
                            {n === 2 && <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="15" fill="#93D1A2"/><circle cx="12" cy="14" r="2" fill="#1F6132"/><circle cx="22" cy="14" r="2" fill="#1F6132"/><path d="M12 21Q17 24.5 22 21" stroke="#1F6132" strokeWidth="2.2" strokeLinecap="round" fill="none"/></svg>}
                            {n === 3 && <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="15" fill="#D49316"/><circle cx="12" cy="14" r="2" fill="white"/><circle cx="22" cy="14" r="2" fill="white"/><path d="M12 22L22 22" stroke="white" strokeWidth="2.2" strokeLinecap="round"/></svg>}
                            {n === 4 && <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="15" fill="#E87460"/><circle cx="12" cy="14" r="2" fill="white"/><circle cx="22" cy="14" r="2" fill="white"/><path d="M12 24Q17 20 22 24" stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none"/></svg>}
                            {n === 5 && <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="15" fill="#D4503A"/><circle cx="12" cy="13" r="2" fill="white"/><circle cx="22" cy="13" r="2" fill="white"/><path d="M10 24Q17 19 24 24" stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none"/></svg>}
                            <span style={{ fontSize: 10, color: '#9A998F', textAlign: 'center', lineHeight: 1.3 }}>
                              {n === 1 ? <>Very<br/>fair</> : n === 5 ? <>Very<br/>unfair</> : SENT_LABELS[n]}
                            </span>
                          </button>
                        ))}
                      </div>
                      {sentErr && <p style={{ fontSize: 12, color: '#D4503A', marginTop: 4 }}>Please select how you feel about your renewal</p>}
                    </div>

                    {/* Note */}
                    <div style={{ marginBottom: 16 }}>
                      <label style={LABEL_STYLE}>
                        Additional comments{' '}
                        <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                      </label>
                      <textarea
                        value={note}
                        maxLength={500}
                        placeholder="Anything your neighbours should know..."
                        onChange={e => setNote(e.target.value)}
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
                      <div style={{ textAlign: 'right', fontSize: 11, color: '#B8B7B1', marginTop: 4 }}>
                        {note.length} / 500
                      </div>
                    </div>

                    {/* Consent */}
                    <div style={{ marginBottom: 8, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={consent}
                        onClick={() => setConsent(c => !c)}
                        style={{
                          width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 2,
                          border: `1.5px solid ${consent ? '#1A1917' : '#D4D3CE'}`,
                          background: consent ? '#1A1917' : '#FFFFFF',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all .15s', padding: 0,
                        }}
                      >
                        {consent && (
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true">
                            <path d="M1 4l3 3 5-6" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                      <p style={{ fontSize: 12, color: '#7C7B72', lineHeight: 1.55, margin: 0 }}>
                        I confirm this information is accurate to the best of my knowledge. I understand my submission will be published anonymously and will never be sold or used for commercial purposes.
                      </p>
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
                        {[
                          { val: `${cntYou}%`, label: 'you paid', sub: 'your renewal' },
                          {
                            val: hasNbrData ? `${cntNbr}%` : 'No data\nyet',
                            label: 'your neighbours',
                            sub: 'average increase',
                            dim: !hasNbrData,
                          },
                          { val: `${cntOnt}%`, label: 'ontario', sub: 'province-wide' },
                        ].map((col, i) => (
                          <div
                            key={i}
                            style={{
                              padding: '14px 12px', textAlign: 'center',
                              borderRight: i < 2 ? '1px solid #EEEDEA' : 'none',
                              background: i === 0 ? '#FAFAF8' : '#FFFFFF',
                            }}
                          >
                            <div style={{ fontSize: 22, fontWeight: 600, color: col.dim ? '#D4D3CE' : '#1A1917', letterSpacing: '-.02em', lineHeight: 1.2, marginBottom: 4, fontVariantNumeric: 'tabular-nums', whiteSpace: 'pre-line' }}>
                              {col.val}
                            </div>
                            <div style={{ fontSize: 10, color: '#9A998F', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>
                              {col.label}
                            </div>
                            <div style={{ fontSize: 10, color: '#B8B7B1' }}>{col.sub}</div>
                          </div>
                        ))}
                      </div>
                      {hasNbrData && (
                        <div style={{ padding: '10px 14px', borderTop: '1px solid #EEEDEA', background: '#FAFAF8' }}>
                          <p style={{ fontSize: 12, color: '#7C7B72', lineHeight: 1.5 }}>
                            {nbrAbove
                              ? `Your renewal is above the ${areaLabel || fsa} average. Worth checking if you can do better.`
                              : `Your renewal is at or below the ${areaLabel || fsa} average.`}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Verify prompt */}
                    <div style={{ marginBottom: 4 }}>
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
                            padding: '9px 20px', borderRadius: 999,
                            border: '1px solid #D4D3CE', background: '#FFFFFF', color: '#7C7B72',
                            cursor: 'pointer', transition: 'background .15s',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#F5F4F1')}
                          onMouseLeave={e => (e.currentTarget.style.background = '#FFFFFF')}
                        >Skip for now</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Footer ── */}
            {step !== 'anim' && (
              <div style={{ padding: '14px 22px 18px', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                {step === 2 && (
                  <button
                    type="button"
                    onClick={goBack}
                    style={{
                      fontFamily: "'Inter', system-ui, sans-serif", fontSize: 14, fontWeight: 500,
                      padding: '11px 18px', borderRadius: 999,
                      border: '1px solid #D4D3CE', background: '#FFFFFF', cursor: 'pointer',
                      color: '#7C7B72', transition: 'background .15s, transform .1s', whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#F5F4F1')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#FFFFFF')}
                  >Back</button>
                )}
                <button
                  type="button"
                  onClick={goNext}
                  disabled={step === 2 && !consent}
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
