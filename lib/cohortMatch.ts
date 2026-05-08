import type { Submission, UserProfile } from '@/lib/types'

export type { UserProfile } from '@/lib/types'

export interface CohortResult {
  tier:   2 | 1 | 'fallback'
  count:  number
  median: number
  min:    number
  max:    number
  ids:    Set<string>
}

const MIN_COHORT = 8

function claimsBracket(n: number | null | undefined): 0 | 1 | 2 {
  if (!n) return 0
  if (n <= 2) return 1
  return 2
}

function convictionBracket(n: number | null | undefined): 0 | 1 {
  return n && n > 0 ? 1 : 0
}

function medianOf(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid]
}

function buildResult(tier: CohortResult['tier'], subset: Submission[]): CohortResult {
  const vals = subset.map(s => s.rate_change_pct as number).sort((a, b) => a - b)
  return {
    tier,
    count:  subset.length,
    median: medianOf(vals),
    min:    vals[0],
    max:    vals[vals.length - 1],
    ids:    new Set(subset.map(s => s.id)),
  }
}

export function matchCohort(profile: UserProfile, submissions: Submission[]): CohortResult | null {
  const pool = submissions.filter(
    s => s.rate_change_pct != null && s.insurance_type === profile.insurance_type
  )
  if (pool.length === 0) return null

  // Tier 2 — strict: type + provider + profile similarity
  const tier2 = pool.filter(s => {
    if (s.provider !== profile.provider) return false
    if (profile.insurance_type === 'auto') {
      if (
        profile.years_licensed != null &&
        s.years_licensed != null &&
        Math.abs(s.years_licensed - profile.years_licensed) > 3
      ) return false
      if (claimsBracket(s.at_fault_claims) !== claimsBracket(profile.at_fault_claims)) return false
      if (convictionBracket(s.convictions) !== convictionBracket(profile.convictions)) return false
    } else {
      if (claimsBracket(s.home_claims) !== claimsBracket(profile.home_claims)) return false
    }
    return true
  })
  if (tier2.length >= MIN_COHORT) return buildResult(2, tier2)

  // Tier 1 — relaxed: type + provider only
  const tier1 = pool.filter(s => s.provider === profile.provider)
  if (tier1.length >= MIN_COHORT) return buildResult(1, tier1)

  // Fallback — all same insurance type
  if (pool.length >= MIN_COHORT) return buildResult('fallback', pool)

  return null
}
