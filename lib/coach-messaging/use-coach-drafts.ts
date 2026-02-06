import { useEffect, useState } from 'react'
import { listDrafts, type CoachMessageDraft } from './drafts'

export function useCoachDrafts(userId: string) {
  const [drafts, setDrafts] = useState<CoachMessageDraft[]>([])

  useEffect(() => {
    if (!userId) return
    const load = async () => {
      const next = await listDrafts()
      setDrafts(next)
    }
    void load()
    const handleDraftsUpdated = () => {
      void load()
    }
    window.addEventListener('coach-drafts-updated', handleDraftsUpdated)
    return () => {
      window.removeEventListener('coach-drafts-updated', handleDraftsUpdated)
    }
  }, [userId])

  return drafts
}
