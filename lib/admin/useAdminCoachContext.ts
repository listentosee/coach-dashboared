"use client"

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export type AdminCoachContext = {
  coachId: string | null
  coachName: string | null
  loading: boolean
  refresh: () => Promise<void>
}

export function useAdminCoachContext(): AdminCoachContext {
  const [coachId, setCoachId] = useState<string | null>(null)
  const [coachName, setCoachName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      // First, determine if current user is an admin. If not, avoid hitting admin endpoint.
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setCoachId(null); setCoachName(null); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      const isAdmin = (profile as any)?.role === 'admin'
      if (!isAdmin) {
        setCoachId(null)
        setCoachName(null)
        return
      }
      const r = await fetch('/api/admin/context')
      if (r.ok) {
        const json = await r.json()
        setCoachId(json.coach_id || null)
        setCoachName(json.coach_name || null)
      } else {
        setCoachId(null)
        setCoachName(null)
      }
    } finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    const handler = () => load()
    window.addEventListener('admin-context-changed', handler)
    return () => window.removeEventListener('admin-context-changed', handler)
  }, [])

  return { coachId, coachName, loading, refresh: load }
}
