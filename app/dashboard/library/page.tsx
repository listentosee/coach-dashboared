'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { CoachLibraryModal } from '@/components/coach-library/CoachLibraryModal'

export default function CoachLibraryPage() {
  const router = useRouter()
  const [open, setOpen] = useState(true)

  const handleClose = useCallback(() => {
    setOpen(false)
    router.push('/dashboard')
  }, [router])

  return <CoachLibraryModal open={open} onClose={handleClose} />
}
