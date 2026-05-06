import { createClient } from '@supabase/supabase-js'

// Fall back to placeholder values so the module doesn't throw during Next.js
// build-time bundle analysis. The actual env vars must be set at runtime.
const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL     ?? 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
