'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function ForceResetPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState('')
  const [pwd, setPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/auth/login'); return }
      setUserEmail(user.email || '')
      setLoading(false)
    }
    init()
  }, [router])

  const handleSubmit = async () => {
    if (submitting || success) return
    setError(null)
    if (pwd.length < 6) { setError('Password must be at least 6 characters'); return }
    if (pwd !== confirm) { setError('Passwords do not match'); return }
    try {
      setSubmitting(true)
      const { error: upErr } = await supabase.auth.updateUser({ password: pwd })
      if (upErr) throw upErr

      // Clear the must_change flag via a trusted server route using service role
      const res = await fetch('/api/auth/clear-must-change', { method: 'POST' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || 'Failed to clear reset flag')
      }

      // Refresh the session so middleware sees updated app_metadata immediately
      await supabase.auth.refreshSession()

      // Mark success and navigate shortly after to avoid double-click
      setSuccess(true)
      setPwd('')
      setConfirm('')
      setTimeout(() => router.replace('/dashboard'), 600)
    } catch (e: any) {
      const msg = e?.message || 'Failed to update password'
      setError(msg)
      console.error('force-reset error:', e)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return null

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Set a New Password</CardTitle>
          <CardDescription>
            Your account was reset by an administrator for security. Please create a new password to continue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={userEmail} disabled className="bg-meta-muted" />
          <Input type="password" placeholder="New password" value={pwd} onChange={e => setPwd(e.target.value)} />
          <Input type="password" placeholder="Confirm new password" value={confirm} onChange={e => setConfirm(e.target.value)} />
          {error && <div className="text-red-600 text-sm">{error}</div>}
          {success && <div className="text-green-600 text-sm">Password updated. Redirecting…</div>}
          <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Updating…' : 'Update Password'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
