'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { CoachLibraryModal } from '@/components/coach-library/CoachLibraryModal'

export default function CoachLibraryPage() {
  const router = useRouter()
  const [open, setOpen] = useState(true)

  const handleClose = useCallback(() => {
    setOpen(false)
    router.back()
  }, [router])

  useEffect(() => {
    if (!open) {
      router.back()
    }
  }, [open, router])

  return <CoachLibraryModal open={open} onClose={handleClose} />
}
