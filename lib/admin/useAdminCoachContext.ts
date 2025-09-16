"use client"

import { useEffect, useState } from 'react'

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

