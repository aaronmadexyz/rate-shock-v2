// Shared types used across MapView, ShareRenewalModal, and page.tsx

export interface Submission {
  id: string
  fsa: string
  provider: string
  insurance_type: 'auto' | 'home'
  rate_change_pct: number | null
  sentiment: number
  verified: boolean
  created_at: string
}

export interface MapViewHandle {
  prependSubmission: (sub: Submission) => void
}
