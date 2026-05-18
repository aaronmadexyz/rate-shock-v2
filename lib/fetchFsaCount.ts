import { supabase } from '@/lib/supabase'

export async function fetchFsaCount(fsa: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('submissions')
      .select('*', { count: 'exact', head: true })
      .ilike('fsa', fsa)
    if (error) return 0
    return count ?? 0
  } catch {
    return 0
  }
}
