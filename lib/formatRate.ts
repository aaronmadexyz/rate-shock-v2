import type { Submission } from './types'

export function formatRate(
  s: Pick<Submission, 'rate_change_pct' | 'rate_change_dollar'>,
): string {
  if (s.rate_change_pct != null) {
    const v = s.rate_change_pct
    if (v < 0) return `${v}%`
    return v >= 50 ? '+50%+' : `+${v}%`
  }
  if (s.rate_change_dollar != null) {
    const v = s.rate_change_dollar
    return v >= 2000 ? '+$2,000+' : `+$${v.toLocaleString()}`
  }
  return '—'
}
