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
    setError(null)
    if (pwd.length < 6) { setError('Password must be at least 6 characters'); return }
    if (pwd !== confirm) { setError('Passwords do not match'); return }
    try {
      const { error: upErr } = await supabase.auth.updateUser({ password: pwd })
      if (upErr) throw upErr
      // Clear the must_change flag via a trusted server route using service role
      await fetch('/api/auth/clear-must-change', { method: 'POST' })
      // Refresh the session so middleware sees updated app_metadata immediately
      await supabase.auth.refreshSession()
      router.replace('/dashboard')
    } catch (e: any) {
      const msg = e?.message || 'Failed to update password'
      setError(msg)
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
          <Button className="w-full" onClick={handleSubmit}>Update Password</Button>
        </CardContent>
      </Card>
    </div>
  )
}
