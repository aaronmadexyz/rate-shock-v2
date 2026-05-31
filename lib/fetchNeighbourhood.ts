import { supabase } from './supabase'
import type { NeighbourhoodStats, RecentReport } from './types'

export async function fetchNeighbourhood(
  fsa: string,
): Promise<NeighbourhoodStats | null> {
  const { data, error } = await supabase
    .from('submissions')
    .select(`
      id,
      fsa,
      neighbourhood,
      insurance_type,
      provider,
      rate_change_pct,
      rate_change_dollar,
      sentiment,
      created_at
    `)
    .eq('fsa', fsa.toUpperCase())
    .order('created_at', { ascending: false })
    .limit(50)

  if (error || !data?.length) return null

  const auto = data.filter(r => r.insurance_type === 'auto')
  const home = data.filter(r => r.insurance_type === 'home')

  const avg = (rows: typeof data) => {
    const valid = rows.filter(r => r.rate_change_pct !== null)
    if (!valid.length) return null
    return (
      Math.round(
        (valid.reduce((s, r) => s + (r.rate_change_pct ?? 0), 0) /
          valid.length) *
          10,
      ) / 10
    )
  }

  const provCount: Record<string, number> = {}
  data.forEach(r => {
    if (r.provider) provCount[r.provider] = (provCount[r.provider] ?? 0) + 1
  })
  const providers = Object.entries(provCount)
    .sort((a, b) => b[1] - a[1])
    .map(([p]) => p)
    .slice(0, 3)

  const recentReports: RecentReport[] = data.slice(0, 5).map(r => ({
    id:                 r.id,
    insurance_type:     r.insurance_type,
    provider:           r.provider,
    rate_change_pct:    r.rate_change_pct,
    rate_change_dollar: r.rate_change_dollar,
    sentiment:          r.sentiment,
  }))

  return {
    fsa:           fsa.toUpperCase(),
    neighbourhood: data[0].neighbourhood ?? fsa.toUpperCase(),
    totalCount:    data.length,
    autoCount:     auto.length,
    homeCount:     home.length,
    autoAvgPct:    avg(auto),
    homeAvgPct:    avg(home),
    providers,
    recentReports,
  }
}
