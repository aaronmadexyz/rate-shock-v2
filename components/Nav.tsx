'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import type { Map as LeafletMap } from 'leaflet'
import { springs } from '@/lib/springs'
import { safeGetItem, safeSetItem } from '@/lib/storage'
import { supabase } from '@/lib/supabase'
import { fetchFsaCount } from '@/lib/fetchFsaCount'
import { getCentroid } from '@/lib/fsaCentroids'
import { getAreaLabel } from '@/lib/fsaData'
import type { NavState } from '@/lib/types'
import { useAnimatedCounter } from '@/lib/useAnimatedCounter'
import { AnimatedStat } from '@/components/AnimatedStat'
import styles from '@/styles/Nav.module.css'

// ─── Types & constants ────────────────────────────────────────────────────────

type SubmissionState = NavState
type SearchStatus = 'idle' | 'loading' | 'valid' | 'pioneer' | 'invalid'

const LS_KEY     = 'ratemap_submission_state'
const LS_PIONEER = 'ratemap_is_pioneer'
const LS_POSTED  = 'ratemap_posted_at'
const NAV_EVENT  = 'ratemap:nav-state'

const ONTARIO_PREFIXES = new Set(['K', 'L', 'M', 'N', 'P'])

// ─── Exported API ─────────────────────────────────────────────────────────────

export function setNavState(state: SubmissionState | string): void {
  if (typeof window === 'undefined') return
  const s = state as SubmissionState
  safeSetItem(LS_KEY, s)
  if (s === 'unverified') safeSetItem(LS_POSTED, new Date().toISOString())
  window.dispatchEvent(new CustomEvent(NAV_EVENT, { detail: s }))
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M1.5 6.5l3.5 4L11 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function ShareCheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M1 6l3.5 3.5L11 1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

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

function SearchSvg() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
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

// ─── Props ────────────────────────────────────────────────────────────────────

interface NavProps {
  isPioneer?:            boolean
  onCtaClick?:           () => void
  mapRef?:               React.MutableRefObject<LeafletMap | null>
  onOpenFeatureRequest?: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Nav({
  isPioneer: pioneeredProp = false,
  onCtaClick,
  mapRef,
  onOpenFeatureRequest,
}: NavProps) {
  // ── Submission state ───────────────────────────────────────────────────────
  const [state,         setState]         = useState<SubmissionState>('new')
  const [isPioneer,     setIsPioneer]     = useState(false)
  const [daysLeft,      setDaysLeft]      = useState(30)
  const [drawerOpen,    setDrawerOpen]    = useState(false)
  const [shareToast,    setShareToast]    = useState(false)
  const [mounted,       setMounted]       = useState(false)
  const [activityCount, setActivityCount] = useState(0)

  // ── Strip stats ────────────────────────────────────────────────────────────
  const [stripStats, setStripStats] = useState<{
    count:   number
    autoAvg: number | null
    homeAvg: number | null
  } | null>(null)

  // Animated counter for submission count — 500ms, whole numbers
  // Rule 4 (ease-out cubic) applied via useAnimatedCounter default easing.
  const displayedCount = useAnimatedCounter(
    stripStats?.count ?? null,
    { duration: 500, decimals: 0 },
  )

  // Tracks whether the count span is mid-animation; hidden from AT during
  // roll-up so intermediate values are not announced (container aria-label
  // provides the authoritative accessible announcement).
  const [countAnimating, setCountAnimating] = useState(false)

  // ── Search ─────────────────────────────────────────────────────────────────
  const [searchValue,  setSearchValue]  = useState('')
  const [searchStatus, setSearchStatus] = useState<SearchStatus>('idle')

  const burgerRef      = useRef<HTMLButtonElement>(null)
  const drawerRef      = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const pendingFsaRef  = useRef<string>('')

  const prefersReduced = useReducedMotion()
  const tapSpring      = { type: 'spring' as const, ...springs.snappy }
  const tapTransition  = prefersReduced ? {} : { scale: 0.97, transition: tapSpring }

  // ── Blur crossfade (Rule 7) ────────────────────────────────────────────────
  const blurEnter = prefersReduced
    ? { opacity: 0 }
    : { opacity: 0, filter: 'blur(2px)', scale: 0.97 }
  const blurShow = prefersReduced
    ? { opacity: 1, transition: { duration: 0.01 } }
    : { opacity: 1, filter: 'blur(0px)', scale: 1, transition: { duration: 0.1 } }
  const blurExit = prefersReduced
    ? { opacity: 0, transition: { duration: 0.01 } }
    : { opacity: 0, filter: 'blur(2px)', scale: 0.97, transition: { duration: 0.06, ease: [0.4, 0, 1, 1] } }

  // ── Mount ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const stored = safeGetItem(LS_KEY) as SubmissionState | null
    if (stored === 'new' || stored === 'unverified' || stored === 'verified') setState(stored)

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

    // Neighbourhood activity badge
    const storedFsa   = safeGetItem('ratemap_last_fsa')
    const lastVisit   = safeGetItem('rateshock_last_visit')
    safeSetItem('rateshock_last_visit', Date.now().toString())
    const currentSt   = (safeGetItem(LS_KEY) ?? 'new') as SubmissionState
    if (storedFsa && lastVisit && (currentSt === 'unverified' || currentSt === 'verified')) {
      supabase
        .from('submissions')
        .select('*', { count: 'exact', head: true })
        .eq('fsa', storedFsa)
        .gt('created_at', new Date(parseInt(lastVisit)).toISOString())
        .then(({ count }) => { if (count && count > 0) setActivityCount(count) })
    }

    // Strip stats — per insurance type
    supabase
      .from('submissions')
      .select('insurance_type, rate_change_pct')
      .not('rate_change_pct', 'is', null)
      .limit(500)
      .then(({ data, error }) => {
        if (error || !data) { setStripStats({ count: 0, autoAvg: null, homeAvg: null }); return }
        const auto = data.filter(r => r.insurance_type === 'auto')
        const home = data.filter(r => r.insurance_type === 'home')
        const avg = (rows: typeof data): number | null =>
          rows.length === 0
            ? null
            : Math.round(rows.reduce((s, r) => s + (r.rate_change_pct ?? 0), 0) / rows.length * 10) / 10
        setStripStats({ count: data.length, autoAvg: avg(auto), homeAvg: avg(home) })
      })

    const onNavEvent = (e: Event) => setState((e as CustomEvent<SubmissionState>).detail)
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

  // ── Close drawer when viewport widens ─────────────────────────────────────
  useEffect(() => {
    const onResize = () => { if (window.innerWidth > 680) setDrawerOpen(false) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ── Count animation guard ──────────────────────────────────────────────────
  // Hide count span from AT during the 500ms roll-up. prefers-reduced-motion
  // snaps to final value immediately (useAnimatedCounter) so no guard needed.
  useEffect(() => {
    if (stripStats?.count == null) return
    const prefersReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    if (!prefersReduced) {
      setCountAnimating(true)
      const t = setTimeout(() => setCountAnimating(false), 500)
      return () => clearTimeout(t)
    }
  }, [stripStats?.count])

  // ── Share ──────────────────────────────────────────────────────────────────
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
    } catch { /* user cancelled */ }
  }, [])

  // ── Search ─────────────────────────────────────────────────────────────────
  async function handleSearch(raw: string) {
    const v = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3)
    setSearchValue(v)
    setSearchStatus('idle')

    if (v.length !== 3) {
      pendingFsaRef.current = ''
      return
    }

    if (!ONTARIO_PREFIXES.has(v[0])) {
      pendingFsaRef.current = ''
      setSearchStatus('invalid')
      return
    }

    const centroid = getCentroid(v)
    if (centroid && mapRef?.current) {
      mapRef.current.flyTo(centroid, 13, { duration: 1.2, easeLinearity: 0.1 })
    }

    pendingFsaRef.current = v
    setSearchStatus('loading')
    const count = await fetchFsaCount(v)

    if (pendingFsaRef.current !== v) return // stale

    const s: SearchStatus = count > 0 ? 'valid' : 'pioneer'
    setSearchStatus(s)

    if (s === 'valid') {
      setTimeout(() => {
        setSearchValue('')
        setSearchStatus('idle')
        pendingFsaRef.current = ''
      }, 400)
    }
  }

  // ── CTA click ──────────────────────────────────────────────────────────────
  const handleCtaClick = useCallback(() => {
    setActivityCount(0)
    onCtaClick?.()
  }, [onCtaClick])

  // ── Derived ────────────────────────────────────────────────────────────────
  const isUrgent        = state === 'unverified' && daysLeft <= 7 && daysLeft > 0
  const neighbourhood   = searchValue.length === 3 ? getAreaLabel(searchValue) : ''
  const showSearchStatus = searchStatus === 'pioneer' || searchStatus === 'invalid'
  const badgeLabel      = activityCount > 9 ? '9+' : String(activityCount)
  const stripIsEmpty    = stripStats !== null && stripStats.count === 0


  // ── CTA content ───────────────────────────────────────────────────────────

  function ctaContent(drawer = false) {
    if (state === 'new') {
      return (
        <span className={styles.ctaInner}>
          <PlusIcon />
          {drawer ? 'Compare my renewal' : 'See how your renewal compares'}
        </span>
      )
    }
    if (state === 'unverified') {
      return (
        <span className={styles.ctaInner}>
          <span className={styles.dot} />
          {drawer ? 'Verify my post' : 'Verify your post'}
          {daysLeft > 0 && (
            <span className={isUrgent ? `${styles.urgencyBadge} ${styles.urgent}` : styles.urgencyBadge}>
              {daysLeft}d
            </span>
          )}
        </span>
      )
    }
    return (
      <span className={styles.ctaInner}>
        <CheckIcon />
        {drawer ? 'Post again' : 'Post another renewal'}
      </span>
    )
  }

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Data strip ─────────────────────────────────────────────────────── */}
      {/* role=status + aria-live=polite: announces once when data loads.
          aria-atomic=true: re-reads the full label (not just the changed part).
          polite (not assertive): informational update — must not interrupt the
          user mid-sentence. Children are aria-hidden during animation;
          the aria-label is the authoritative accessible representation. */}
      <div
        className={stripIsEmpty ? `${styles.strip} ${styles.stripEmpty}` : styles.strip}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label={
          stripStats
            ? `${stripStats.count} renewal${stripStats.count === 1 ? '' : 's'} shared.${
                stripStats.autoAvg !== null
                  ? ` Auto average ${stripStats.autoAvg >= 0 ? 'plus' : 'minus'} ${Math.abs(stripStats.autoAvg).toFixed(1)} percent.`
                  : ''
              }${
                stripStats.homeAvg !== null
                  ? ` Home average ${stripStats.homeAvg >= 0 ? 'plus' : 'minus'} ${Math.abs(stripStats.homeAvg).toFixed(1)} percent.`
                  : ''
              }`
            : 'Loading renewal statistics'
        }
      >
        {stripStats && stripStats.count > 0 && (
          <>
            {/* aria-hidden during roll-up — intermediate values are meaningless
                to AT; the container aria-label provides the settled value */}
            <span
              className={styles.stripBold}
              aria-hidden={countAnimating}
            >
              {displayedCount}
            </span>
            <span className={styles.stripText}>
              {' '}renewal{stripStats.count === 1 ? '' : 's'}{' '}shared
            </span>

            {stripStats.autoAvg !== null && (
              <>
                <span className={styles.stripDot}>·</span>
                <span className={styles.stripText}>Auto{' '}</span>
                <AnimatedStat value={stripStats.autoAvg} loading={false} />
              </>
            )}

            {stripStats.homeAvg !== null && (
              <>
                <span className={styles.stripDot}>·</span>
                <span className={styles.stripText}>Home{' '}</span>
                <AnimatedStat value={stripStats.homeAvg} loading={false} />
              </>
            )}
          </>
        )}

        {/* Skeleton while loading — role=presentation: purely decorative shimmer.
            Loading state is announced via the container's aria-label above. */}
        {!stripStats && (
          <span
            className={styles.stripSkeleton}
            aria-hidden="true"
            role="presentation"
          />
        )}
      </div>

      {/* ── Main bar ───────────────────────────────────────────────────────── */}
      <div className={styles.bar}>
        <div className={styles.barInner}>

          {/* Brand */}
          <a href="/" className={styles.brand}>
            <div className={styles.brandWords}>
              <span className={styles.brandName}>RateShock</span>
              <span className={styles.brandSub}>See what your neighbours are really paying.</span>
            </div>
          </a>

          {/* Search */}
          <div className={styles.searchWrap}>
            <label htmlFor="nav-fsa-search" className={styles.searchLabel}>
              Jump to postal area
            </label>
            <span className={styles.searchIcon}>
              <SearchSvg />
            </span>
            <input
              ref={searchInputRef}
              id="nav-fsa-search"
              type="search"
              className={styles.searchInput}
              value={searchValue}
              maxLength={3}
              placeholder="Postal area — M5V"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={e => void handleSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  setSearchValue('')
                  setSearchStatus('idle')
                  pendingFsaRef.current = ''
                  searchInputRef.current?.blur()
                }
              }}
            />

            {/* Status popup — above the input */}
            <AnimatePresence>
              {showSearchStatus && (
                <motion.div
                  key={searchStatus}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={prefersReduced ? { duration: 0 } : { duration: 0.12 }}
                  className={styles.searchStatus}
                >
                  {searchStatus === 'pioneer' && (
                    <div className={styles.searchStatusPioneer}>
                      <ClockIcon />
                      <span className={styles.searchStatusPioneerText}>
                        No reports in {neighbourhood} yet.{' '}
                        <button
                          type="button"
                          className={styles.searchStatusPioneerBtn}
                          onClick={handleCtaClick}
                        >
                          Be the first.
                        </button>
                      </span>
                    </div>
                  )}
                  {searchStatus === 'invalid' && (
                    <span className={styles.searchStatusInvalid}>
                      Try a valid Ontario postal code — like M5V or L6T
                    </span>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right cluster */}
          <div className={styles.rightCluster}>

            {/* Pioneer nudge — desktop only (CSS hides on mobile) */}
            {mounted && isPioneer && state !== 'new' && (
              <div style={{ position: 'relative' }}>
                <motion.button
                  type="button"
                  onClick={() => void handleShare()}
                  className={styles.nudge}
                  whileTap={tapTransition}
                >
                  <ShareCheckIcon />
                  You&apos;re on the map
                  <span className={styles.nudgeSep} aria-hidden="true" />
                  Share with neighbours
                </motion.button>
                {shareToast && (
                  <div role="status" aria-live="polite" className={styles.shareToast}>
                    Link copied
                  </div>
                )}
              </div>
            )}

            {/* Lightbulb — desktop only (CSS hides on mobile) */}
            <motion.button
              type="button"
              aria-label="Share a feature request"
              onClick={() => onOpenFeatureRequest?.()}
              className={styles.iconBtn}
              whileTap={tapTransition}
            >
              <LightbulbIcon />
            </motion.button>

            {/* CTA — desktop only (CSS hides on mobile) */}
            {mounted ? (
              <div className={styles.ctaWrap}>
                <motion.button
                  type="button"
                  data-state={state}
                  className={styles.cta}
                  onClick={handleCtaClick}
                  whileTap={tapTransition}
                >
                  {/* Rule 7: blur crossfade on state change */}
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={state}
                      initial={blurEnter}
                      animate={blurShow}
                      exit={blurExit}
                    >
                      {ctaContent()}
                    </motion.span>
                  </AnimatePresence>
                </motion.button>

                {/* Activity badge — Rule 5: origin-aware (top right) */}
                {activityCount > 0 && (
                  <motion.span
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', ...springs.snappy }}
                    style={{ transformOrigin: 'top right' }}
                    className={styles.badge}
                  >
                    {badgeLabel}
                  </motion.span>
                )}
              </div>
            ) : (
              <div style={{ width: 180, height: 34, borderRadius: 9999, background: 'var(--n-150)', opacity: 0.5 }} />
            )}

            {/* Hamburger — mobile only (CSS shows on mobile) */}
            <motion.button
              ref={burgerRef}
              type="button"
              onClick={() => setDrawerOpen(o => !o)}
              aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={drawerOpen}
              className={styles.burger}
              whileTap={tapTransition}
            >
              <span
                className={styles.burgerBar}
                style={{ transform: drawerOpen ? 'translateY(6.5px) rotate(45deg)' : undefined }}
              />
              <span
                className={styles.burgerBar}
                style={{
                  transform: drawerOpen ? 'scaleX(0)' : undefined,
                  opacity:   drawerOpen ? 0 : undefined,
                }}
              />
              <span
                className={styles.burgerBar}
                style={{ transform: drawerOpen ? 'translateY(-6.5px) rotate(-45deg)' : undefined }}
              />
            </motion.button>

          </div>
        </div>
      </div>

      {/* ── Mobile drawer ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {drawerOpen && (
          <motion.div
            ref={drawerRef}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={prefersReduced ? { duration: 0 } : { type: 'spring', ...springs.gentle }}
            className={styles.drawerWrap}
          >
            <div className={styles.drawerInner}>

              {/* Status note */}
              {state !== 'new' && (
                <p
                  className={styles.drawerStatus}
                  style={{
                    color:      isUrgent ? 'var(--cau-600)' : undefined,
                    fontWeight: isUrgent ? 500      : undefined,
                  }}
                >
                  {state === 'unverified'
                    ? (isUrgent
                        ? `Your renewal window closes in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Verify before it lapses.`
                        : 'Your renewal is on the map — verify it to make it count more.')
                    : "You're verified and on the map."}
                </p>
              )}

              {/* Pioneer nudge — mobile */}
              {isPioneer && state !== 'new' && (
                <>
                  <motion.button
                    type="button"
                    onClick={() => { void handleShare(); setDrawerOpen(false) }}
                    className={styles.drawerNudge}
                    whileTap={tapTransition}
                  >
                    <ShareCheckIcon />
                    Share with neighbours
                  </motion.button>
                  <div style={{ height: 1, background: 'var(--n-100)', margin: '2px 0' }} />
                </>
              )}

              {/* Drawer CTA */}
              <motion.button
                type="button"
                data-state={state}
                className={styles.drawerCta}
                onClick={() => { handleCtaClick(); setDrawerOpen(false) }}
                whileTap={tapTransition}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={state}
                    initial={blurEnter}
                    animate={blurShow}
                    exit={blurExit}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                  >
                    {ctaContent(true)}
                  </motion.span>
                </AnimatePresence>
              </motion.button>

              {/* Feature request row */}
              <button
                type="button"
                className={styles.drawerFr}
                onClick={() => { onOpenFeatureRequest?.(); setDrawerOpen(false) }}
              >
                <LightbulbIcon />
                What should we build next?
              </button>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
