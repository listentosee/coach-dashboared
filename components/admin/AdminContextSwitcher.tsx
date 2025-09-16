"use client"

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase/client'

type Coach = { id: string; name?: string; email?: string }

export default function AdminContextSwitcher() {
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(true)
  const [coachId, setCoachId] = useState<string | null>(null)
  const [coachName, setCoachName] = useState<string>('')
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      // Avoid 403 noise: check role client-side first
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setVisible(false); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      const isAdmin = (profile as any)?.role === 'admin'
      if (!isAdmin) { setVisible(false); return }
      const r = await fetch('/api/admin/context')
      if (!r.ok) { setVisible(false); return }
      setVisible(true)
      const json = await r.json()
      setCoachId(json.coach_id || null)
      setCoachName(json.coach_name || '')
      // Load coach options (admin-only endpoint)
      const c = await fetch('/api/users/coaches')
      if (c.ok) {
        const data = await c.json()
        const list: Coach[] = (data.coaches || []).map((u: any) => ({ id: u.id, name: u.name, email: u.email }))
        setCoaches(list)
      }
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])
  // Debounce query to reduce re-filter churn and prepare for server-side search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200)
    return () => clearTimeout(t)
  }, [query])

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    if (!q) return coaches
    return coaches.filter(c => (c.name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q))
  }, [coaches, debouncedQuery])

  const currentLabel = coachId ? (coachName || coaches.find(c => c.id === coachId)?.name || coaches.find(c => c.id === coachId)?.email || 'Selected coach') : 'All coaches'

  const setContext = async (id: string | null) => {
    setSubmitting(true)
    try {
      const r = await fetch('/api/admin/context', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coach_id: id }) })
      if (r.ok) {
        await load()
        window.dispatchEvent(new Event('admin-context-changed'))
      }
    } finally { setSubmitting(false) }
  }

  if (!visible) return null

  return (
    <div className="mb-4 p-3 border border-meta-border rounded bg-meta-card">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm">
          <span className="text-meta-muted mr-2">Admin Coach Context:</span>
          <span className="inline-flex items-center px-2 py-1 rounded bg-meta-dark border border-meta-border text-meta-light gap-2">
            {currentLabel}
            {(loading || submitting) && (
              <span className="inline-block h-3 w-3 rounded-full border-2 border-meta-muted border-t-transparent animate-spin" />
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search coaches..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-56 bg-meta-dark border-meta-border text-meta-light placeholder:text-meta-muted"
          />
          <select
            className="bg-meta-dark border border-meta-border text-meta-light rounded px-2 py-1"
            value={coachId || ''}
            onChange={(e) => setContext(e.target.value || null)}
            disabled={loading || submitting}
            title="Select a coach to enable edits; All coaches is read-only"
          >
            <option value="">All coaches (read-only)</option>
            {filtered.map(c => (
              <option key={c.id} value={c.id}>{c.name || c.email || c.id}</option>
            ))}
          </select>
          {coachId && (
            <Button size="sm" variant="outline" onClick={() => setContext(null)} disabled={submitting} title="Clear coach context (read-only mode)">Clear</Button>
          )}
        </div>
      </div>
    </div>
  )
}
