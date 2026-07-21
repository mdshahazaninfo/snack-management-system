import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim() || ''
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || ''

export const isSupabaseConfigured = Boolean(url && key)
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  key || 'placeholder-key',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
)
