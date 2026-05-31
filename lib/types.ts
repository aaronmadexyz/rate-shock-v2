// Shared types used across all components and lib modules.

export interface Submission {
  id:                  string
  created_at:          string
  fsa:                 string
  neighbourhood:       string | null
  insurance_type:      'auto' | 'home'
  provider:            string
  rate_change_pct:     number | null
  rate_change_dollar:  number | null
  mode:                'pct' | 'dollar'
  years_licensed:      number | null
  at_fault_claims:     number
  convictions:         number
  home_claims:         number
  sentiment:           number
  comment_raw:         string | null
  comment_explanation: string | null
  comment_loyalty:     string | null
  comment_shopping:    string | null
  comment_tone:        string | null
  verified:            boolean
  renewal_year:        number | null
}

export interface FeatureRequest {
  id:         string
  created_at: string
  message:    string
  fsa:        string | null
  page_url:   string | null
}

export interface FilterState {
  insuranceType: 'auto' | 'home' | null
  provider:      string | null
  rMin:          number  // default -30
  rMax:          number  // default  50
}

export interface MapViewHandle {
  prependSubmission: (sub: Submission) => void
  flyToFsa:          (fsa: string) => void
}

export interface UserProfile {
  insurance_type:  'auto' | 'home'
  provider:        string
  fsa:             string
  rate_change_pct: number
  years_licensed:  number | null
  at_fault_claims: number | null
  convictions:     number | null
  home_claims:     number | null
}

export type NavState = 'new' | 'unverified' | 'verified'

export interface RecentReport {
  id:                 string
  insurance_type:     'auto' | 'home'
  provider:           string
  rate_change_pct:    number | null
  rate_change_dollar: number | null
  sentiment:          number
}

export interface NeighbourhoodStats {
  fsa:            string
  neighbourhood:  string
  totalCount:     number
  autoCount:      number
  homeCount:      number
  autoAvgPct:     number | null
  homeAvgPct:     number | null
  providers:      string[]     // sorted by count desc, top 3
  recentReports:  RecentReport[]
}
