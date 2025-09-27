"use client"

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import AdminMessagesPage from './admin-legacy'
import { CoachMessagingWorkspace } from '@/components/coach-messaging/coach-messaging-workspace'

type RoleState = 'admin' | 'coach' | 'loading'

export default function MessagesRouterPage() {
  const [role, setRole] = useState<RoleState>('loading')

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const { data } = await supabase.auth.getUser()
        const user = data?.user
        if (!user) {
          if (mounted) setRole('coach')
          return
        }
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()
        const nextRole = (profile as any)?.role === 'admin' ? 'admin' : 'coach'
        if (mounted) setRole(nextRole)
      } catch {
        if (mounted) setRole('coach')
      }
    }
    void load()
    return () => {
      mounted = false
    }
  }, [])

  if (role === 'loading') {
    return <div className="p-6 text-sm text-meta-muted">Loading messaging…</div>
  }

  return role === 'admin' ? <AdminMessagesPage /> : <CoachMessagingWorkspace />
}
