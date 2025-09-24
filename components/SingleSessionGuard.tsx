"use client"

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'

// Ensures only one active authenticated user across tabs in the same browser.
// When a different user logs in in another tab, all tabs reload to adopt
// the most-recent session, preventing mixed admin/coach states.
export default function SingleSessionGuard() {
  const userIdRef = useRef<string | null>(null)
  const roleRef = useRef<string | null>(null)
  const channelRef = useRef<BroadcastChannel | null>(null)
  const enabled = process.env.NEXT_PUBLIC_SINGLE_SESSION_GUARD === '1'

  useEffect(() => {
    if (!enabled) return
    let mounted = true
    let authSubscription: { unsubscribe: () => void } | null = null
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!mounted) return
      userIdRef.current = user?.id ?? null
      if (user?.id) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()
          roleRef.current = (profile as any)?.role || null
        } catch { roleRef.current = null }
      } else {
        roleRef.current = null
      }

      // Announce current user to other tabs
      channelRef.current = new BroadcastChannel('cd-auth')
      const chan = channelRef.current
      const announce = () => chan?.postMessage({ type: 'auth_state', id: userIdRef.current, role: roleRef.current, at: Date.now() })

      chan.onmessage = (ev) => {
        const msg = ev.data || {}
        if (msg.type === 'auth_state') {
          const otherId = msg.id ?? null
          const otherRole = msg.role ?? null
          // If an admin session appears in another tab and this tab is not admin, unify to that session
          if (otherRole === 'admin' && roleRef.current !== 'admin') {
            window.location.reload()
            return
          }
          // If a different user ID is detected (cookie changed in another tab), unify
          if (otherId !== userIdRef.current) {
            window.location.reload()
            return
          }
        }
      }

      announce()

      // Watch for auth changes in this tab and broadcast
      const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
        userIdRef.current = session?.user?.id ?? null
        if (session?.user?.id) {
          try {
            const { data: p } = await supabase
              .from('profiles')
              .select('role')
              .eq('id', session.user.id)
              .single()
            roleRef.current = (p as any)?.role || null
          } catch { roleRef.current = null }
        } else {
          roleRef.current = null
        }
        announce()
      })
      authSubscription = sub.subscription
    }

    init()

    return () => {
      mounted = false
      channelRef.current?.close()
      authSubscription?.unsubscribe()
    }
  }, [enabled])

  if (!enabled) return null
  return null
}
