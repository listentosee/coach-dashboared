"use client"

import { useAdminCoachContext } from '@/lib/admin/useAdminCoachContext'

export default function ActingAsBanner() {
  const { coachId, coachName, loading } = useAdminCoachContext()

  if (loading) {
    return (
      <div className="mt-1 text-sm text-meta-muted inline-flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-full border-2 border-meta-muted border-t-transparent animate-spin" />
        Updating context…
      </div>
    )
  }

  if (!coachId) return null

  return (
    <div className="mt-1 text-sm text-meta-muted">Acting as {coachName || 'selected coach'}</div>
  )
}

