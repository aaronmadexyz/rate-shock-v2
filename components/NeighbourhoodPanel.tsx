'use client'

import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { motion } from 'framer-motion'
import type { NeighbourhoodStats, RecentReport } from '@/lib/types'
import { useReducedMotion } from '@/lib/motionSafety'
import styles from '@/styles/NeighbourhoodPanel.module.css'

// ─── Rate tier helpers ────────────────────────────────────────────────────────

function tierColor(pct: number | null): string {
  if (pct === null) return 'var(--n-500)' /* #706F67 — 5.05:1 on white ✓ AA */
  if (pct < 0) return 'var(--pos-600)'
  if (pct <= 7) return 'var(--n-600)'
  if (pct <= 16) return 'var(--cau-600)'
  return 'var(--neg-500)'
}

// Typographic minus U+2212 (−) in visible text
function fmtRate(pct: number | null): string {
  if (pct === null) return '—' // em dash for "no data"
  if (pct < 0) return `−${Math.abs(pct)}%`
  return `+${pct}%`
}

function rateAriaLabel(pct: number | null): string {
  if (pct === null) return 'no data'
  if (pct < 0) return `${Math.abs(pct)} percent decrease`
  return `${pct} percent increase`
}

// ─── Sentiment face (mirrors MapView.tsx) ─────────────────────────────────────

function SentimentFace({ sentiment, size }: { sentiment: number | null; size: number }) {
  if (sentiment === 1)
    return (
      <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
        <circle cx="17" cy="17" r="15" fill="#3A9B55" />
        <circle cx="12" cy="14" r="2" fill="white" />
        <circle cx="22" cy="14" r="2" fill="white" />
        <path d="M10 21Q17 27 24 21" stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      </svg>
    )
  if (sentiment === 2)
    return (
      <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
        <circle cx="17" cy="17" r="15" fill="#93D1A2" />
        <circle cx="12" cy="14" r="2" fill="#1F6132" />
        <circle cx="22" cy="14" r="2" fill="#1F6132" />
        <path d="M12 21Q17 24.5 22 21" stroke="#1F6132" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      </svg>
    )
  if (sentiment === 3)
    return (
      <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
        <circle cx="17" cy="17" r="15" fill="#D49316" />
        <circle cx="12" cy="14" r="2" fill="white" />
        <circle cx="22" cy="14" r="2" fill="white" />
        <path d="M12 22L22 22" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    )
  if (sentiment === 4)
    return (
      <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
        <circle cx="17" cy="17" r="15" fill="var(--neg-200)" />
        <circle cx="12" cy="14" r="2" fill="white" />
        <circle cx="22" cy="14" r="2" fill="white" />
        <path d="M12 24Q17 20 22 24" stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      </svg>
    )
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r="15" fill="#D4503A" />
      <circle cx="12" cy="13" r="2" fill="white" />
      <circle cx="22" cy="13" r="2" fill="white" />
      <path d="M10 24Q17 19 24 24" stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none" />
    </svg>
  )
}

// ─── Skeleton body ────────────────────────────────────────────────────────────

function SkeletonBody() {
  return (
    <div className={styles.skeletonContainer} aria-hidden="true">
      <div className={`${styles.skeleton} ${styles.skRow1}`} />
      <div className={`${styles.skeleton} ${styles.skRow2}`} />
      <div className={`${styles.skeleton} ${styles.skRow3}`} />
    </div>
  )
}

// ─── Sparse body (totalCount < 3) ─────────────────────────────────────────────

interface SparseBodyProps {
  stats:          NeighbourhoodStats | null
  fsa:            string
  globalCount?:   number
  onReportClick:  (report: RecentReport, trigger: HTMLElement) => void
}

function SparseBody({ stats, fsa, onReportClick }: SparseBodyProps) {
  const fsaUpper      = (stats?.fsa ?? fsa).toUpperCase()
  const neighbourhood = stats?.neighbourhood ?? fsaUpper
  const totalCount    = stats?.totalCount ?? 0
  const reports       = stats?.recentReports ?? []

  const badgeText =
    totalCount === 0
      ? `${fsaUpper} · First to report`
      : totalCount === 1
        ? `${fsaUpper} · 1 of the first to report`
        : `${fsaUpper} · ${totalCount} reports so far`

  const headline =
    totalCount === 0
      ? `No renewals shared in ${neighbourhood} yet.`
      : totalCount === 1
        ? `1 renewal shared in ${neighbourhood} so far.`
        : `${totalCount} renewals shared in ${neighbourhood} so far.`

  // Tighter copy — one focused sentence per count state
  const bodyCopy =
    totalCount === 0
      ? `Be one of the first to share yours and help neighbours understand what's being charged.`
      : totalCount === 1
        ? `Add yours — one more report makes this area's data useful for comparison.`
        : `One more report makes this area comparable. Share yours.`

  return (
    <>
      {/* A — Pioneer badge */}
      <div className={styles.pioneerBadge} role="status" aria-live="polite">
        <span aria-hidden="true">★</span>
        {badgeText}
      </div>

      {/* B — Report rows FIRST (data before recruitment copy) */}
      {reports.length > 0 && (
        <ul className={styles.sparsePreviewList} role="list">
          {reports.map(report => (
            <li
              key={report.id}
              className={`${styles.sparsePreviewRow} ${styles.reportRow}`}
              role="listitem"
              tabIndex={0}
              aria-label={`View details for this ${report.insurance_type} renewal — ${fmtRate(report.rate_change_pct)}`}
              onClick={e => onReportClick(report, e.currentTarget as HTMLElement)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onReportClick(report, e.currentTarget as HTMLElement) } }}
            >
              <SentimentFace sentiment={report.sentiment} size={24} />
              <span
                className={styles.recentRate}
                style={{ color: tierColor(report.rate_change_pct) }}
                aria-label={rateAriaLabel(report.rate_change_pct)}
              >
                {fmtRate(report.rate_change_pct)}
              </span>
              <span className={styles.recentMeta}>
                {report.provider} · {report.insurance_type === 'auto' ? 'Auto' : 'Home'}
              </span>
              <div className={styles.rowAction}>
                <span className={styles.rowActionLabel}>View details</span>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={styles.rowChevron}>
                  <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* C — Divider: data → recruitment copy transition (only when reports exist) */}
      {reports.length > 0 && (
        <div className={styles.sparseDivider} aria-hidden="true" />
      )}

      {/* D — Headline */}
      <p className={styles.sparseHeadline}>{headline}</p>

      {/* E — Shortened body copy (no social proof — moved to footer) */}
      <p className={styles.sparseCopy}>{bodyCopy}</p>
    </>
  )
}

// ─── Aggregate body (totalCount >= 3) ────────────────────────────────────────

interface AggregateBodyProps {
  stats:         NeighbourhoodStats
  onReportClick: (report: RecentReport, trigger: HTMLElement) => void
}

function AggregateBody({ stats, onReportClick }: AggregateBodyProps) {
  return (
    <>
      {/* Section 1 — Type breakdown */}
      <p className={styles.sectionLabel}>BY TYPE</p>
      <div className={styles.typeGrid} role="group" aria-label="Breakdown by insurance type">
        {/* Auto */}
        <div className={styles.typeCard}>
          <div className={styles.typeIconRow}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M2 9h10M1 9l1.8-3.5h8.4L13 9M4 11a1 1 0 100-2 1 1 0 000 2zM10 11a1 1 0 100-2 1 1 0 000 2z"
                stroke="var(--n-400)"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className={styles.typeLabel}>Auto</span>
          </div>
          <div
            className={`${styles.typeAvg}${stats.autoAvgPct === null ? ` ${styles.typeAvgEmpty}` : ''}`}
            style={stats.autoAvgPct !== null ? { color: tierColor(stats.autoAvgPct) } : undefined}
            aria-label={rateAriaLabel(stats.autoAvgPct)}
          >
            {fmtRate(stats.autoAvgPct)}
          </div>
          <div className={styles.typeCount}>
            {stats.autoCount > 0
              ? `${stats.autoCount} report${stats.autoCount !== 1 ? 's' : ''}`
              : 'No data yet'}
          </div>
        </div>

        {/* Home */}
        <div className={styles.typeCard}>
          <div className={styles.typeIconRow}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M1.5 7L7 2l5.5 5M3 6.5V12h8V6.5"
                stroke="var(--n-400)"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className={styles.typeLabel}>Home</span>
          </div>
          <div
            className={`${styles.typeAvg}${stats.homeAvgPct === null ? ` ${styles.typeAvgEmpty}` : ''}`}
            style={stats.homeAvgPct !== null ? { color: tierColor(stats.homeAvgPct) } : undefined}
            aria-label={rateAriaLabel(stats.homeAvgPct)}
          >
            {fmtRate(stats.homeAvgPct)}
          </div>
          <div className={styles.typeCount}>
            {stats.homeCount > 0
              ? `${stats.homeCount} report${stats.homeCount !== 1 ? 's' : ''}`
              : 'No data yet'}
          </div>
        </div>
      </div>

      {/* Section 2 — Top providers */}
      {stats.providers.length > 0 && (
        <>
          <p className={`${styles.sectionLabel} ${styles.sectionLabelSpaced}`}>MOST REPORTED</p>
          <div className={styles.pillRow}>
            {stats.providers.map(p => (
              <span key={p} className={styles.pill}>{p}</span>
            ))}
          </div>
        </>
      )}

      {/* Section 3 — Recent reports */}
      <p className={`${styles.sectionLabel} ${styles.sectionLabelSpaced}`}>RECENT</p>
      <ul className={styles.recentList} role="list">
        {stats.recentReports.map((r: RecentReport, i: number) => (
          <li
            key={r.id}
            className={[
              styles.recentRow,
              styles.reportRow,
              i === stats.recentReports.length - 1 ? styles.recentRowLast : '',
            ].filter(Boolean).join(' ')}
            role="listitem"
            tabIndex={0}
            aria-label={`View details for this ${r.insurance_type} renewal — ${fmtRate(r.rate_change_pct)}`}
            onClick={e => onReportClick(r, e.currentTarget as HTMLElement)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onReportClick(r, e.currentTarget as HTMLElement) } }}
          >
            <SentimentFace sentiment={r.sentiment} size={24} />
            <span
              className={styles.recentRate}
              style={{ color: tierColor(r.rate_change_pct) }}
              aria-label={rateAriaLabel(r.rate_change_pct)}
            >
              {fmtRate(r.rate_change_pct)}
            </span>
            <span className={styles.recentMeta}>
              {r.provider} · {r.insurance_type === 'auto' ? 'Auto' : 'Home'}
            </span>
            <div className={styles.rowAction}>
              <span className={styles.rowActionLabel}>View details</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={styles.rowChevron}>
                <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

// ─── NeighbourhoodPanel ───────────────────────────────────────────────────────

interface NeighbourhoodPanelProps {
  stats:        NeighbourhoodStats | null
  loading:      boolean
  fsa:          string
  onClose:      () => void
  onCtaClick:   (fsa: string) => void
  globalCount?: number
  isDesktop?:   boolean
  /* When true: right-column layout, no backdrop, complementary role,
     slide-in from right instead of slide-up from bottom */
}

const DETAIL_EXIT_MS = 180

export default function NeighbourhoodPanel({
  stats,
  loading,
  fsa,
  onClose,
  onCtaClick,
  globalCount,
  isDesktop = false,
}: NeighbourhoodPanelProps) {
  const { prefersReduced } = useReducedMotion()
  const closeBtnRef  = useRef<HTMLButtonElement>(null)
  const backBtnRef   = useRef<HTMLButtonElement>(null)
  const openerRef    = useRef<HTMLElement | null>(null)
  const openedFromRef = useRef<HTMLElement | null>(null)

  // ── Detail layer state ────────────────────────────────────────────────────────
  const [detailReport,    setDetailReport]    = useState<RecentReport | null>(null)
  const [isDetailExiting, setIsDetailExiting] = useState(false)

  // ── Peek / full snap state (mobile only) ─────────────────────────────────────
  const [snapPoint, setSnapPoint] = useState<'peek' | 'full'>('peek')
  const panelBodyRef = useRef<HTMLDivElement>(null)

  // ── Swipe hint (shown once per session, mobile only) ─────────────────────────
  const [showSwipeHint, setShowSwipeHint] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const seen = sessionStorage.getItem('rshock_swipe_hint_seen')
    if (!seen) {
      setShowSwipeHint(true)
      sessionStorage.setItem('rshock_swipe_hint_seen', '1')
    }
  }, [])

  function openDetail(report: RecentReport, trigger: HTMLElement) {
    openedFromRef.current = trigger
    if (!isDesktop) setSnapPoint('full')
    setDetailReport(report)
    setTimeout(() => backBtnRef.current?.focus(), 50)
  }

  function handleBodyScroll(e: React.UIEvent<HTMLDivElement>) {
    if (isDesktop || snapPoint === 'full') return
    if (e.currentTarget.scrollTop > 0) setSnapPoint('full')
  }

  function closeDetail() {
    setIsDetailExiting(true)
    setTimeout(() => {
      setIsDetailExiting(false)
      setDetailReport(null)
      openedFromRef.current?.focus()
    }, DETAIL_EXIT_MS)
  }

  // Capture opener, focus close button on mount; restore focus on unmount
  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement
    closeBtnRef.current?.focus()
    return () => {
      openerRef.current?.focus()
    }
  }, [])

  // Escape: close detail layer first, then panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (detailReport) closeDetail()
      else onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, detailReport])

  // Reset to peek whenever a new neighbourhood is opened
  useEffect(() => {
    setSnapPoint('peek')
  }, [fsa])

  // Expand to full if body content overflows the 65vh peek height
  useEffect(() => {
    if (isDesktop || !panelBodyRef.current) return
    const contentHeight = panelBodyRef.current.scrollHeight
    const peekHeight    = window.innerHeight * 0.65
    if (contentHeight > peekHeight) setSnapPoint('full')
  }, [stats, isDesktop])

  const isSparse    = !stats || stats.totalCount < 3
  const title       = stats?.neighbourhood ?? fsa.toUpperCase()
  const resolvedFsa = (stats?.fsa ?? fsa).toUpperCase()

  const neighbourhood = stats?.neighbourhood ?? fsa.toUpperCase()

  const ctaLabel =
    stats && stats.totalCount === 0
      ? `Be the first in ${neighbourhood} →`
      : stats && stats.totalCount >= 3
        ? 'See how yours compares →'
        : 'Share my renewal →'

  const ctaAriaLabel =
    stats && stats.totalCount === 0
      ? `Be the first in ${neighbourhood} to share your renewal`
      : stats && stats.totalCount >= 3
        ? `See how your renewal compares in ${neighbourhood}`
        : `Share your renewal for ${neighbourhood}`

  function handleCtaClick() {
    navigator.vibrate?.(10)
    onCtaClick(resolvedFsa)
  }

  return (
    <>
      {/* Map hit area — mobile peek state only: transparent overlay above panel
          that dismisses the panel when the user taps the visible map area */}
      {!isDesktop && (
        <div
          className={styles.mapHitArea}
          data-snap={snapPoint}
          onClick={onClose}
          role="button"
          aria-label="Close panel and return to map"
          tabIndex={-1}
        />
      )}

      {/* Backdrop — shown on both desktop and mobile.
          Desktop: CSS overrides to rgba(.08) — map stays readable.
          Mobile:  CSS default rgba(.28) — heavier dim. Shrinks to panel
          height in peek state so the map above the panel is undimmed. */}
      <motion.div
        className={styles.backdrop}
        data-snap={!isDesktop ? snapPoint : undefined}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: prefersReduced ? 0.15 : 0.3, ease: 'easeInOut' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel
          Desktop: pure translateX from right edge — no scale, no fade.
            Rule 4: ease-out cubic-bezier(.16,1,.3,1) ✓
            Rule 5: transform-origin right center (entry direction) ✓
            Rule 6: 280ms enter / 180ms exit — both < 300ms ✓
          Mobile: slide-up from bottom + scale from .97 (unchanged)
            Rule 2: starts scale(0.97) not 0 ✓
      */}
      <motion.div
        className={[
          styles.panel,
          detailReport ? styles.panelDetailOpen : '',
        ].filter(Boolean).join(' ')}
        data-mode={stats && stats.totalCount >= 3 ? 'aggregate' : 'sparse'}
        data-snap={isDesktop ? undefined : snapPoint}
        style={{ transformOrigin: isDesktop ? 'right center' : 'bottom center' }}
        initial={
          prefersReduced
            ? { opacity: 0 }
            : isDesktop
              ? { x: 400 }                          // start fully off-screen right
              : { y: 16, scale: 0.97, opacity: 0 }
        }
        animate={{ x: 0, y: 0, scale: 1, opacity: 1 }}
        exit={
          prefersReduced
            ? { opacity: 0, transition: { duration: 0.15 } }
            : isDesktop
              ? {
                  x: 400,                            // slide back fully off-screen
                  transition: {
                    duration: 0.18,
                    ease: [0.4, 0, 1, 1] as [number, number, number, number],
                  },
                }
              : {
                  y: 8,
                  opacity: 0,
                  transition: {
                    duration: 0.18,
                    ease: [0.4, 0, 1, 1] as [number, number, number, number],
                  },
                }
        }
        transition={
          prefersReduced
            ? { duration: 0.15 }
            : {
                duration: isDesktop ? 0.28 : 0.34,
                ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
              }
        }
        // Desktop: complementary landmark (persistent sidebar beside map content)
        // Mobile: dialog (blocking overlay requiring user action to dismiss)
        role={isDesktop ? 'complementary' : 'dialog'}
        aria-modal={isDesktop ? undefined : 'true'}
        aria-labelledby="np-title"
        aria-live="polite"
      >
        {/* Drag handle + one-time swipe hint */}
        <div className={styles.dragHandleWrap} aria-hidden="true">
          <div className={styles.dragHandle} />
          {showSwipeHint && (
            <p className={styles.swipeHint} aria-hidden="true">
              swipe down to close
            </p>
          )}
        </div>

        {/* Header */}
        <div className={styles.header}>
          <h2 id="np-title" className={styles.headerTitle}>
            {title}
          </h2>
          <button
            ref={closeBtnRef}
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <path
                d="M1.5 1.5l7 7M8.5 1.5l-7 7"
                stroke="var(--n-400)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className={styles.body} ref={panelBodyRef} onScroll={handleBodyScroll}>
          {loading ? (
            <SkeletonBody />
          ) : stats && !isSparse ? (
            <AggregateBody stats={stats} onReportClick={openDetail} />
          ) : (
            <SparseBody stats={stats} fsa={fsa} globalCount={globalCount} onReportClick={openDetail} />
          )}
        </div>

        {/* Footer: social proof + CTA */}
        <div className={styles.footer}>
          {/* Social proof — above button */}
          {(globalCount ?? 0) > 0 && (
            <p className={styles.socialProof}>
              Join {globalCount} Ontario{' '}policyholders who've shared
            </p>
          )}

          {/* CTA button */}
          <button
            className={styles.ctaBtn}
            onClick={handleCtaClick}
            aria-label={ctaAriaLabel}
          >
            {ctaLabel}
          </button>
        </div>

        {/* ── Detail layer — slides over summary within panel bounds ── */}
        {detailReport && (
          <div
            className={[
              styles.detailLayer,
              isDetailExiting ? styles.detailLayerExit : '',
            ].filter(Boolean).join(' ')}
            role="region"
            aria-label="Renewal detail"
          >
            {/* Detail header — back button */}
            <div className={styles.detailHeader}>
              <button
                ref={backBtnRef}
                className={styles.backBtn}
                onClick={closeDetail}
                aria-label="Back to neighbourhood summary"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Back</span>
              </button>
            </div>

            {/* Detail body */}
            <div className={styles.detailBody}>

              {/* Rate block */}
              <div className={styles.detailRate}>
                <SentimentFace sentiment={detailReport.sentiment} size={32} />
                <span
                  className={styles.detailRateVal}
                  style={{ color: tierColor(detailReport.rate_change_pct) }}
                  aria-label={rateAriaLabel(detailReport.rate_change_pct)}
                >
                  {fmtRate(detailReport.rate_change_pct)}
                </span>
              </div>

              {/* Provider · Type */}
              <p className={styles.detailMeta}>
                {detailReport.provider}{' · '}{detailReport.insurance_type === 'auto' ? 'Auto' : 'Home'}
              </p>

              {/* Driver profile — auto only */}
              {detailReport.insurance_type === 'auto' && (
                <div className={styles.detailProfile}>
                  <p className={styles.detailSectionLabel}>DRIVER PROFILE</p>
                  <div className={styles.profileGrid}>
                    <div className={styles.profileStat}>
                      <span className={styles.profileVal}>
                        {detailReport.years_licensed ?? '—'}
                      </span>
                      <span className={styles.profileLbl}>
                        {detailReport.years_licensed === 1 ? 'yr licensed' : 'yrs licensed'}
                      </span>
                    </div>
                    <div className={styles.profileStat}>
                      <span className={styles.profileVal}>{detailReport.at_fault_claims}</span>
                      <span className={styles.profileLbl}>
                        {detailReport.at_fault_claims === 1 ? 'at-fault claim' : 'at-fault claims'}
                      </span>
                    </div>
                    <div className={styles.profileStat}>
                      <span className={styles.profileVal}>{detailReport.convictions}</span>
                      <span className={styles.profileLbl}>
                        {detailReport.convictions === 1 ? 'conviction' : 'convictions'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Comment — only when present */}
              {detailReport.comment_raw && (
                <div className={styles.detailComment}>
                  <p className={styles.detailSectionLabel}>NEIGHBOUR SAID</p>
                  <blockquote className={styles.commentText}>
                    {detailReport.comment_raw}
                  </blockquote>
                </div>
              )}

              {/* Date */}
              <p className={styles.detailDate}>
                {new Date(detailReport.created_at).toLocaleDateString('en-CA', {
                  month: 'long',
                  year:  'numeric',
                })}
              </p>

            </div>
          </div>
        )}
      </motion.div>
    </>
  )
}
