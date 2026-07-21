import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type Profile = { id: string; full_name: string | null; role: 'admin' | 'manager' | 'cashier' | 'viewer'; status: 'active' | 'pending' | 'disabled' }
type AuthValue = { session: Session | null; user: User | null; profile: Profile | null; loading: boolean; signOut: () => Promise<void>; refreshProfile: () => Promise<void> }
const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = async (userId?: string) => {
    const id = userId || session?.user.id
    if (!id) { setProfile(null); return }
    const { data } = await supabase.from('profiles').select('id,full_name,role,status').eq('id', id).maybeSingle()
    setProfile((data as Profile | null) ?? null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      loadProfile(data.session?.user.id).finally(() => setLoading(false))
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      loadProfile(next?.user.id).finally(() => setLoading(false))
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthValue>(() => ({
    session,
    user: session?.user ?? null,
    profile,
    loading,
    signOut: async () => { await supabase.auth.signOut() },
    refreshProfile: async () => loadProfile(),
  }), [session, profile, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
