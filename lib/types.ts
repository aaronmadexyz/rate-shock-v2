// Shared types used across all components and lib modules.

export interface Submission {
  id:                 string
  created_at:         string
  fsa:                string
  insurance_type:     'auto' | 'home'
  provider:           string
  rate_change_pct:    number | null
  rate_change_dollar?: number | null
  mode:               'pct' | 'dollar'
  sentiment:          1 | 2 | 3 | 4 | 5
  comment_raw:        string | null
  verified:           boolean
  neighbourhood:      string | null
  // Profile fields — present when fetched for cohort matching
  years_licensed?:    number | null
  at_fault_claims?:   number | null
  convictions?:       number | null
  home_claims?:       number | null
}

export interface FeatureRequest {
  id:         string
  created_at: string
  message:    string
  fsa:        string | null
  page_url:   string | null
}

export interface FilterState {
  types:    { auto: boolean; home: boolean }
  provs:    string[]
  rMin:     number
  rMax:     number
  verified: boolean
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
