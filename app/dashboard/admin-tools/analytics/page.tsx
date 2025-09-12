import { cookies } from 'next/headers'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'

export const dynamic = 'force-dynamic'

export default async function AdminAnalyticsPage({ searchParams }: { searchParams?: { coach_id?: string } }) {
  const supabase = createServerComponentClient({ cookies })

  // Auth check
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return <div className="p-6 text-meta-light">Unauthorized</div>
  }

  const coachId = searchParams?.coach_id

  // Coach list for selector
  const { data: coaches } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'coach')
    .order('full_name')

  // Basic counts (optionally filtered by coach)
  const [{ count: coachCount }, { count: competitorCount }, { count: teamCount }] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'coach'),
    (async () => {
      let q = supabase.from('competitors').select('id', { count: 'exact', head: true })
      if (coachId) q = q.eq('coach_id', coachId)
      const { count } = await q; return { count }
    })(),
    (async () => {
      let q = supabase.from('teams').select('id', { count: 'exact', head: true })
      if (coachId) q = q.eq('coach_id', coachId)
      const { count } = await q; return { count }
    })()
  ])

  // Competitor status breakdown
  const statusKeys = ['pending','profile','compliance','complete'] as const
  const statusCounts: Record<string, number> = {}
  for (const s of statusKeys) {
    let q = supabase.from('competitors').select('id', { count: 'exact', head: true }).eq('status', s)
    if (coachId) q = q.eq('coach_id', coachId)
    const { count } = await q
    statusCounts[s] = count || 0
  }

  // Release/Agreement status approximation
  // complete: any required agreement dates present
  let compQ = supabase
    .from('competitors')
    .select('id', { count: 'exact', head: true })
    .or('participation_agreement_date.not.is.null,media_release_date.not.is.null')
  if (coachId) compQ = compQ.eq('coach_id', coachId)
  const { count: completeRelease } = await compQ

  // sent: agreement row exists but no dates stamped yet
  // To compute 'sent' under a coach, filter agreements by competitor ids owned by that coach
  let competitorIds: string[] | undefined = undefined
  if (coachId) {
    const { data: idRows } = await supabase.from('competitors').select('id').eq('coach_id', coachId)
    competitorIds = (idRows || []).map(r => r.id)
  }
  let aQ = supabase
    .from('agreements')
    .select('competitor_id, manual_completed_at, zoho_completed')
  if (competitorIds && competitorIds.length > 0) aQ = aQ.in('competitor_id', competitorIds)
  const { data: sentRows } = await aQ
  const sentIds = new Set((sentRows || []).filter(a => !a.manual_completed_at && !(a as any).zoho_completed).map(a => a.competitor_id))
  let sentCount = 0
  if (sentIds.size > 0) {
    let sc = supabase.from('competitors').select('id', { count: 'exact', head: true }).in('id', Array.from(sentIds))
    if (coachId) sc = sc.eq('coach_id', coachId)
    const { count } = await sc
    sentCount = count || 0
  }

  const notStarted = (competitorCount || 0) - (completeRelease || 0) - (sentCount || 0)

  const pct = (n: number | null | undefined) => {
    const total = competitorCount || 0
    return total === 0 ? 0 : Math.round(((n || 0) / total) * 100)
  }

  return (
    <div className="relative p-6">
      {/* Futuristic background layers */}
      <div className="pointer-events-none absolute inset-0 opacity-20" style={{background: 'radial-gradient(800px 400px at 20% -10%, #3b82f6, transparent), radial-gradient(700px 300px at 120% 50%, #10b981, transparent)'}} />
      <div className="pointer-events-none absolute inset-0 opacity-10" style={{background: 'linear-gradient(130deg, rgba(255,255,255,.06) 0%, rgba(255,255,255,0) 60%)'}} />

      <div className="relative space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-wide text-meta-light">Operations Analytics</h1>
          <p className="text-meta-muted mt-2">Live overview of coaches, teams, competitors and forms</p>
        </div>

        {/* Coach selector + Stat tiles */}
        <form className="flex items-center justify-between" action="/dashboard/admin-tools/analytics" method="get">
          <div className="text-sm text-meta-muted">Filter by Coach</div>
          <div className="flex items-center gap-2">
            <select name="coach_id" defaultValue={coachId || ''} className="bg-meta-card border border-meta-border text-meta-light px-3 py-2 rounded">
              <option value="">All Coaches</option>
              {(coaches || []).map((c: any) => (
                <option key={c.id} value={c.id}>{c.full_name || c.email}</option>
              ))}
            </select>
            <button className="px-3 py-2 rounded bg-meta-accent text-white" type="submit">Apply</button>
          </div>
        </form>

        {/* Stat tiles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { label: 'Coaches', value: coachCount || 0, glow: 'from-blue-500/30 to-blue-300/5' },
            { label: 'Competitors', value: competitorCount || 0, glow: 'from-emerald-500/30 to-emerald-300/5' },
            { label: 'Teams', value: teamCount || 0, glow: 'from-fuchsia-500/30 to-fuchsia-300/5' },
          ].map((s, i) => (
            <div key={i} className={`relative rounded border border-meta-border bg-meta-card overflow-hidden`}> 
              <div className={`absolute -inset-1 bg-gradient-to-br ${s.glow} blur-xl`} />
              <div className="relative p-5">
                <div className="text-sm text-meta-muted">{s.label}</div>
                <div className="text-4xl font-extrabold tracking-wider text-meta-light">{s.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Competitor breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded border border-meta-border bg-meta-card p-5">
            <div className="mb-4">
              <div className="text-sm text-meta-muted">Competitor Status</div>
              <div className="text-meta-light text-lg font-semibold">Distribution</div>
            </div>
            <div className="space-y-4">
              {[
                {k: 'pending', label: 'Pending', color: 'bg-yellow-500'},
                {k: 'profile', label: 'Profile', color: 'bg-blue-500'},
                {k: 'compliance', label: 'Compliance', color: 'bg-purple-500'},
                {k: 'complete', label: 'Complete', color: 'bg-green-500'},
              ].map((row) => {
                const c = statusCounts[row.k as keyof typeof statusCounts] || 0
                const w = pct(c)
                return (
                  <div key={row.k} className="text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-meta-light">{row.label}</div>
                      <div className="text-meta-muted">{c} • {w}%</div>
                    </div>
                    <div className="h-2 rounded bg-meta-dark">
                      <div className={`${row.color} h-2 rounded`} style={{width: `${w}%`}} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded border border-meta-border bg-meta-card p-5">
            <div className="mb-4">
              <div className="text-sm text-meta-muted">Release / Agreements</div>
              <div className="text-meta-light text-lg font-semibold">Pipeline</div>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between"><span className="text-meta-muted">Not Started</span><span className="text-meta-light font-semibold">{notStarted}</span></div>
              <div className="flex items-center justify-between"><span className="text-meta-muted">Sent</span><span className="text-meta-light font-semibold">{sentCount || 0}</span></div>
              <div className="flex items-center justify-between"><span className="text-meta-muted">Complete</span><span className="text-meta-light font-semibold">{completeRelease || 0}</span></div>
            </div>
          </div>
        </div>

        {/* Game platform placeholder */}
        <div className="rounded border border-meta-border bg-meta-card p-5">
          <div className="text-sm text-meta-muted">Game Platform</div>
          <div className="text-meta-light text-lg font-semibold mb-2">Integration Pending</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="bg-meta-dark/60 rounded p-3 border border-meta-border/50">
              <div className="text-meta-muted">Challenge Participation</div>
              <div className="text-meta-light">Coming soon</div>
            </div>
            <div className="bg-meta-dark/60 rounded p-3 border border-meta-border/50">
              <div className="text-meta-muted">Flash CTF</div>
              <div className="text-meta-light">Coming soon</div>
            </div>
            <div className="bg-meta-dark/60 rounded p-3 border border-meta-border/50">
              <div className="text-meta-muted">Finals Leaderboard</div>
              <div className="text-meta-light">Coming soon</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
