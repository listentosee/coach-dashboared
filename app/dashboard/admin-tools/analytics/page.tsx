import { createServerClient } from '@/lib/supabase/server'
import { DemographicCharts, DemographicChartConfig } from '@/components/dashboard/admin/demographic-charts'
import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase'
import { CoachSummaryTable, CoachSummaryRow } from '@/components/dashboard/admin/coach-summary-table'
import { TeamSummaryTable, TeamSummaryRow } from '@/components/dashboard/admin/team-summary-table'
import { SchoolDistributionMap } from '@/components/dashboard/admin/school-distribution-map'
import { AnalyticsSharePanel } from '@/components/dashboard/admin/analytics-share-panel'

export const dynamic = 'force-dynamic'

type ActivityBucket = 'school_day' | 'weekday_before_school' | 'weekday_after_school' | 'weekend' | 'unknown'

interface MetricRow {
  label: string
  value: number
  secondary?: string
}

interface SchoolMapPoint {
  id: string
  coachName: string
  schoolName: string
  division: string | null
  lat: number
  lon: number
}

interface ServiceSupabaseLike {
  from: (table: string) => {
    select: (columns: string) => {
      in: (column: string, values: string[]) => {
        range: (from: number, to: number) => Promise<{ data: any[] | null; error: any }>
      }
    }
  }
}

const numberFormatter = new Intl.NumberFormat('en-US')
const pacificActivityFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  weekday: 'short',
  hour: '2-digit',
  hourCycle: 'h23',
})

function formatNumber(value: number) {
  return numberFormatter.format(value)
}

async function fetchAllRowsByIds<T>({
  client,
  table,
  columns,
  idColumn,
  ids,
  chunkSize = 50,
  pageSize = 1000,
}: {
  client: ServiceSupabaseLike
  table: string
  columns: string
  idColumn: string
  ids: string[]
  chunkSize?: number
  pageSize?: number
}): Promise<T[]> {
  if (!ids.length) return []

  const rows: T[] = []

  for (let chunkStart = 0; chunkStart < ids.length; chunkStart += chunkSize) {
    const chunk = ids.slice(chunkStart, chunkStart + chunkSize)
    let from = 0

    while (true) {
      const { data, error } = await client
        .from(table)
        .select(columns)
        .in(idColumn, chunk)
        .range(from, from + pageSize - 1)

      if (error) {
        throw error
      }

      const page = (data || []) as T[]
      rows.push(...page)

      if (page.length < pageSize) {
        break
      }

      from += pageSize
    }
  }

  return rows
}

function formatDivisionLabel(division?: string | null, programTrack?: string | null) {
  const normalizedDivision = (division || '').trim().toLowerCase()
  if (normalizedDivision === 'college') {
    return (programTrack || '').trim().toLowerCase() === 'adult_ed' ? 'ROP College' : 'Traditional College'
  }
  if (normalizedDivision === 'middle_school') return 'Middle School'
  if (normalizedDivision === 'high_school') return 'High School'
  return 'Unassigned'
}

function normalizeChallengeCategoryLabel(raw?: string | null) {
  if (!raw) return 'Uncategorized'
  const cleaned = raw.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return 'Uncategorized'

  switch (cleaned) {
    case 'crypto':
    case 'cryptography':
      return 'Cryptography'
    case 'foren':
    case 'forensics':
      return 'Forensics'
    case 'reven':
    case 'reverse engineering':
    case 'reversing':
      return 'Reverse Engineering'
    case 'binexp':
    case 'binary exploitation':
      return 'Binary Exploitation'
    case 'osint':
      return 'OSINT'
    case 'web':
      return 'Web'
    case 'operating systems':
    case 'operating system':
    case 'os':
      return 'Operating Systems'
    case 'misc':
    case 'miscellaneous':
      return 'Miscellaneous'
    default:
      return cleaned.replace(/\b\w/g, (match) => match.toUpperCase())
  }
}

function classifyPacificActivity(timestamp?: string | null): ActivityBucket {
  if (!timestamp) return 'unknown'

  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return 'unknown'

  const parts = pacificActivityFormatter.formatToParts(date)
  const weekday = parts.find((part) => part.type === 'weekday')?.value
  const hourPart = parts.find((part) => part.type === 'hour')?.value
  const hour = hourPart ? Number.parseInt(hourPart, 10) : Number.NaN

  if (!weekday || Number.isNaN(hour)) return 'unknown'

  const isWeekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday)
  if (!isWeekday) return 'weekend'
  if (hour < 9) return 'weekday_before_school'
  if (hour >= 15) return 'weekday_after_school'
  return 'school_day'
}

function MetricBarList({
  rows,
  emptyMessage,
}: {
  rows: MetricRow[]
  emptyMessage: string
}) {
  if (!rows.length) {
    return (
      <div className="rounded border border-dashed border-meta-border/60 bg-meta-dark/30 p-6 text-sm text-meta-muted">
        {emptyMessage}
      </div>
    )
  }

  const maxValue = Math.max(...rows.map((row) => row.value), 1)

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const width = Math.max((row.value / maxValue) * 100, row.value > 0 ? 8 : 0)
        return (
          <div key={row.label} className="rounded border border-meta-border/50 bg-meta-dark/40 p-3">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-meta-light">{row.label}</div>
                {row.secondary ? <div className="text-xs text-meta-muted">{row.secondary}</div> : null}
              </div>
              <div className="text-lg font-semibold text-meta-light">{formatNumber(row.value)}</div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-meta-dark">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-sky-400 to-emerald-400"
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default async function AdminAnalyticsPage({ searchParams }: { searchParams?: Promise<{ coach_id?: string }> }) {
  const supabase = createServerClient()
  const serviceSupabase = getServiceRoleSupabaseClient()

  const resolvedParams = searchParams ? await searchParams : undefined
  const coachId = resolvedParams?.coach_id

  // Auth check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return <div className="p-6 text-meta-light">Unauthorized</div>
  }

  // Coach list for selector
  const { data: coaches } = await supabase
    .from('profiles')
    .select('id, full_name, email, school_name')
    .eq('role', 'coach')
    .order('full_name')

  const { data: coachCounts } = await serviceSupabase
    .from('coach_competitor_counts')
    .select('coach_id, competitor_count')

  const coachCountMap = new Map((coachCounts || []).map((row: any) => [row.coach_id, Number(row.competitor_count) || 0]))

  let schoolMapPoints: SchoolMapPoint[] = []
  {
    let schoolMapQuery = supabase
      .from('profiles')
      .select('id, full_name, email, school_name, division, school_geo')
      .eq('role', 'coach')

    if (coachId) {
      schoolMapQuery = schoolMapQuery.eq('id', coachId)
    }

    const { data: schoolRows } = await schoolMapQuery

    schoolMapPoints = ((schoolRows || []) as Array<{
      id: string
      full_name: string | null
      email: string | null
      school_name: string | null
      division: string | null
      school_geo: { lat?: unknown; lon?: unknown } | null
    }>)
      .map((row) => {
        const lat = typeof row.school_geo?.lat === 'number' ? row.school_geo.lat : null
        const lon = typeof row.school_geo?.lon === 'number' ? row.school_geo.lon : null
        if (lat === null || lon === null || !row.school_name) return null

        return {
          id: row.id,
          coachName: row.full_name || row.email || row.id,
          schoolName: row.school_name,
          division: row.division ?? null,
          lat,
          lon,
        }
      })
      .filter((row): row is SchoolMapPoint => Boolean(row))
  }

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
  const statusKeys = ['pending', 'profile', 'in_the_game_not_compliant', 'complete', 'compliance'] as const
  const statusCounts: Record<string, number> = {}
  for (const s of statusKeys) {
    let q = supabase.from('competitors').select('id', { count: 'exact', head: true }).eq('status', s)
    if (coachId) q = q.eq('coach_id', coachId)
    const { count } = await q
    statusCounts[s] = count || 0
  }
  statusCounts.profile = (statusCounts.profile || 0) + (statusCounts.compliance || 0)

  // Coach summary grid data
  const [
    { data: allCompetitors },
    { data: allTeamMembers },
    { data: allGameProfiles },
    { data: allTeams },
  ] = await Promise.all([
    serviceSupabase.from('competitors').select('id, coach_id, status, years_competing, game_platform_id'),
    serviceSupabase.from('team_members').select('competitor_id, team_id'),
    serviceSupabase.from('game_platform_profiles').select('competitor_id, status').in('status', ['approved', 'user_created']),
    serviceSupabase.from('teams').select('id, name, division, coach_id, image_url'),
  ])

  // Build lookup sets
  const competitorsWithTeam = new Set(
    (allTeamMembers || []).map((tm: any) => tm.competitor_id)
  )
  const activeGameCompetitors = new Set(
    (allGameProfiles || []).map((gp: any) => gp.competitor_id)
  )
  const teamsWithMembers = new Set(
    (allTeamMembers || []).map((tm: any) => tm.team_id)
  )

  const coachSummaryMap = new Map<string, CoachSummaryRow>()
  for (const c of (coaches || [])) {
    coachSummaryMap.set(c.id, {
      coach_id: c.id,
      coach_name: c.full_name || c.email || c.id,
      total_competitors: 0,
      pending: 0,
      in_game_compliant: 0,
      in_game_non_compliant: 0,
      in_teams: 0,
      not_in_team: 0,
      active_in_game_platform: 0,
      total_teams: 0,
      teams_without_image: 0,
      teams_without_members: 0,
    })
  }

  for (const comp of (allCompetitors || [])) {
    const row = coachSummaryMap.get(comp.coach_id)
    if (!row) continue
    row.total_competitors++
    if (comp.status === 'pending') row.pending++
    if (comp.status === 'complete') row.in_game_compliant++
    if (comp.status === 'in_the_game_not_compliant') row.in_game_non_compliant++
    if (competitorsWithTeam.has(comp.id)) row.in_teams++
    else row.not_in_team++
    if (activeGameCompetitors.has(comp.id)) row.active_in_game_platform++
  }

  for (const team of (allTeams || [])) {
    const row = coachSummaryMap.get(team.coach_id)
    if (!row) continue
    row.total_teams++
    if (!team.image_url) row.teams_without_image++
    if (!teamsWithMembers.has(team.id)) row.teams_without_members++
  }

  const coachSummaryData: CoachSummaryRow[] = Array.from(coachSummaryMap.values())
    .sort((a, b) => a.coach_name.localeCompare(b.coach_name))

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

  // Demographic breakdowns
  const eligibleStatuses: string[] = ['profile', 'in_the_game_not_compliant', 'complete', 'compliance']
  let demographicRows: Array<{
    gender: string | null
    race: string | null
    ethnicity: string | null
    level_of_technology: string | null
    years_competing: number | null
    division: string | null
    program_track: string | null
  }> = []
  {
    let demoQuery = supabase
      .from('competitors')
      .select('gender, race, ethnicity, level_of_technology, years_competing, division, program_track')
      .in('status', eligibleStatuses)

    if (coachId) {
      demoQuery = demoQuery.eq('coach_id', coachId)
    }

    const { data: demoData } = await demoQuery
    if (demoData) {
      demographicRows = demoData as typeof demographicRows
    }
  }

  const normalizeLabel = (value: string | null | undefined) => {
    if (!value) return null
    const base = value.trim().toLowerCase()
    if (!base) return null
    return base
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  const buildChartData = (
    key: 'gender' | 'race' | 'ethnicity' | 'level_of_technology',
    fallbackLabel: string
  ): DemographicChartConfig['data'] => {
    if (!demographicRows.length) return []
    const counts = new Map<string, number>()
    for (const row of demographicRows) {
      const raw = row[key]
      const normalized = normalizeLabel(typeof raw === 'string' ? raw : null)
      const label = normalized || fallbackLabel
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }

  const demographicCharts: DemographicChartConfig[] = [
    {
      title: 'Gender Identity',
      description: 'Self-reported gender from competitor profiles.',
      data: buildChartData('gender', 'Not provided'),
    },
    {
      title: 'Race',
      description: 'Self-reported race categories.',
      data: buildChartData('race', 'Not provided'),
    },
    {
      title: 'Ethnicity',
      description: 'Self-reported ethnicity.',
      data: buildChartData('ethnicity', 'Not provided'),
    },
    {
      title: 'Technology Access',
      description: 'Preferred level of technology reported by competitors.',
      data: buildChartData('level_of_technology', 'Not provided'),
    },
  ]

  const divisionCounts = new Map<string, number>()
  if (demographicRows.length) {
    for (const row of demographicRows) {
      const label = formatDivisionLabel(row.division, row.program_track)
      divisionCounts.set(label, (divisionCounts.get(label) ?? 0) + 1)
    }
  }

  const divisionChart: DemographicChartConfig = {
    title: 'Division Mix',
    description: 'Middle school, high school, and college tracks.',
    data: Array.from(divisionCounts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value),
  }

  // Years competing histogram (grouped buckets)
  const yearsCounts = new Map<string, number>()
  if (demographicRows.length) {
    for (const row of demographicRows) {
      const value = row.years_competing
      let label = 'Not provided'
      if (typeof value === 'number' && !Number.isNaN(value) && value >= 0) {
        if (value < 1) label = '< 1 year'
        else if (value < 3) label = '1-2 years'
        else if (value < 5) label = '3-4 years'
        else label = '5+ years'
      }
      yearsCounts.set(label, (yearsCounts.get(label) ?? 0) + 1)
    }
  }

  if (yearsCounts.size) {
    demographicCharts.push({
      title: 'Years Participating',
      description: 'How long competitors have been participating.',
      data: Array.from(yearsCounts.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value),
    })
  }

  let platformCompetitors: Array<{
    id: string
    division: string | null
    program_track: string | null
    game_platform_id: string | null
    team_members:
      | Array<{ team_id: string | null; teams: { id: string; division: string | null } | null }>
      | { team_id: string | null; teams: { id: string; division: string | null } | null }
      | null
  }> = []

  {
    let platformCompetitorsQuery = serviceSupabase
      .from('competitors')
      .select(`
        id,
        division,
        program_track,
        game_platform_id,
        team_members(team_id, teams(id, division))
      `)

    if (coachId) {
      platformCompetitorsQuery = platformCompetitorsQuery.eq('coach_id', coachId)
    }

    const { data } = await platformCompetitorsQuery
    if (data) {
      platformCompetitors = data as typeof platformCompetitors
    }
  }

  const platformCompetitorIds = platformCompetitors.map((competitor) => competitor.id)

  let platformMappings: Array<{ competitor_id: string | null; synced_user_id: string | null }> = []
  let platformStatsRows: Array<{ competitor_id: string; challenges_completed: number | null }> = []

  if (platformCompetitorIds.length) {
    const [{ data: mappingData }, { data: statsData }] = await Promise.all([
      serviceSupabase
        .from('game_platform_profiles')
        .select('competitor_id, synced_user_id')
        .in('competitor_id', platformCompetitorIds),
      serviceSupabase
        .from('game_platform_stats')
        .select('competitor_id, challenges_completed')
        .in('competitor_id', platformCompetitorIds),
    ])

    platformMappings = (mappingData || []) as typeof platformMappings
    platformStatsRows = (statsData || []) as typeof platformStatsRows
  }

  const syncedUserIdByCompetitorId = new Map<string, string>()
  for (const mapping of platformMappings) {
    if (mapping.competitor_id && mapping.synced_user_id) {
      syncedUserIdByCompetitorId.set(mapping.competitor_id, mapping.synced_user_id)
    }
  }

  const statsByCompetitorId = new Map<string, number>()
  for (const row of platformStatsRows) {
    statsByCompetitorId.set(row.competitor_id, Number(row.challenges_completed) || 0)
  }

  const competitorScope = platformCompetitors.map((competitor) => {
    const teamMembership = Array.isArray(competitor.team_members)
      ? competitor.team_members[0] ?? null
      : competitor.team_members ?? null
    const teamDivision = teamMembership?.teams?.division ?? null
    const divisionLabel = formatDivisionLabel(teamDivision || competitor.division, competitor.program_track)
    const syncedUserId = competitor.game_platform_id || syncedUserIdByCompetitorId.get(competitor.id) || null
    return {
      competitorId: competitor.id,
      divisionLabel,
      syncedUserId,
    }
  })

  const syncedUserIds = Array.from(new Set(
    competitorScope
      .map((competitor) => competitor.syncedUserId)
      .filter((value): value is string => Boolean(value))
  ))

  let platformChallengeSolves: Array<{
    synced_user_id: string
    challenge_category: string | null
    challenge_points: number | null
    solved_at: string | null
  }> = []
  let platformFlashEvents: Array<{
    synced_user_id: string
    event_id: string
    started_at: string | null
  }> = []

  if (syncedUserIds.length) {
    const [solvesData, flashData] = await Promise.all([
      fetchAllRowsByIds<typeof platformChallengeSolves[number]>({
        client: serviceSupabase as ServiceSupabaseLike,
        table: 'game_platform_challenge_solves',
        columns: 'synced_user_id, challenge_category, challenge_points, solved_at',
        idColumn: 'synced_user_id',
        ids: syncedUserIds,
      }),
      fetchAllRowsByIds<typeof platformFlashEvents[number]>({
        client: serviceSupabase as ServiceSupabaseLike,
        table: 'game_platform_flash_ctf_events',
        columns: 'synced_user_id, event_id, started_at',
        idColumn: 'synced_user_id',
        ids: syncedUserIds,
      }),
    ])

    platformChallengeSolves = solvesData
    platformFlashEvents = flashData
  }

  const divisionSolveTotals = new Map<string, number>()
  const divisionLinkedCompetitors = new Map<string, number>()
  const ctfEntriesByDivision = new Map<string, number>()
  const ctfParticipantsByDivision = new Map<string, Set<string>>()
  const scopeBySyncedUserId = new Map<string, { divisionLabel: string }>()
  const solveCountBySyncedUserId = new Map<string, number>()
  const topicCounts = new Map<string, number>()

  const activityCounts = {
    total: 0,
    schoolDay: 0,
    outsideSchool: 0,
    weekdayBeforeSchool: 0,
    weekdayAfterSchool: 0,
    weekend: 0,
  }

  const recordActivity = (timestamp?: string | null) => {
    const bucket = classifyPacificActivity(timestamp)
    if (bucket === 'unknown') return
    activityCounts.total += 1
    if (bucket === 'school_day') {
      activityCounts.schoolDay += 1
      return
    }
    activityCounts.outsideSchool += 1
    if (bucket === 'weekday_before_school') activityCounts.weekdayBeforeSchool += 1
    if (bucket === 'weekday_after_school') activityCounts.weekdayAfterSchool += 1
    if (bucket === 'weekend') activityCounts.weekend += 1
  }

  for (const competitor of competitorScope) {
    divisionSolveTotals.set(competitor.divisionLabel, divisionSolveTotals.get(competitor.divisionLabel) ?? 0)
    ctfEntriesByDivision.set(competitor.divisionLabel, ctfEntriesByDivision.get(competitor.divisionLabel) ?? 0)
    ctfParticipantsByDivision.set(competitor.divisionLabel, ctfParticipantsByDivision.get(competitor.divisionLabel) ?? new Set())
    if (competitor.syncedUserId) {
      divisionLinkedCompetitors.set(
        competitor.divisionLabel,
        (divisionLinkedCompetitors.get(competitor.divisionLabel) ?? 0) + 1,
      )
      scopeBySyncedUserId.set(competitor.syncedUserId, {
        divisionLabel: competitor.divisionLabel,
      })
    }
  }

  for (const solve of platformChallengeSolves) {
    solveCountBySyncedUserId.set(
      solve.synced_user_id,
      (solveCountBySyncedUserId.get(solve.synced_user_id) ?? 0) + 1,
    )
    const topic = normalizeChallengeCategoryLabel(solve.challenge_category)
    topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1)
    recordActivity(solve.solved_at)
  }

  for (const event of platformFlashEvents) {
    recordActivity(event.started_at)
    const scope = scopeBySyncedUserId.get(event.synced_user_id)
    if (!scope) continue
    ctfEntriesByDivision.set(scope.divisionLabel, (ctfEntriesByDivision.get(scope.divisionLabel) ?? 0) + 1)
    const participants = ctfParticipantsByDivision.get(scope.divisionLabel) ?? new Set<string>()
    participants.add(event.synced_user_id)
    ctfParticipantsByDivision.set(scope.divisionLabel, participants)
  }

  let totalChallengesSolved = 0
  let linkedPlatformCompetitors = 0

  for (const competitor of competitorScope) {
    if (competitor.syncedUserId) {
      linkedPlatformCompetitors += 1
    }
    const challengesSolved = statsByCompetitorId.get(competitor.competitorId)
      ?? (competitor.syncedUserId ? solveCountBySyncedUserId.get(competitor.syncedUserId) : undefined)
      ?? 0
    divisionSolveTotals.set(
      competitor.divisionLabel,
      (divisionSolveTotals.get(competitor.divisionLabel) ?? 0) + challengesSolved,
    )
    totalChallengesSolved += challengesSolved
  }

  const outsideSchoolPct = activityCounts.total === 0
    ? 0
    : Math.round((activityCounts.outsideSchool / activityCounts.total) * 100)
  const recordedActivityCount = activityCounts.total

  const ctfParticipationRows: MetricRow[] = Array.from(ctfParticipantsByDivision.entries())
    .map(([label, participants]) => {
      const participantCount = participants.size
      const entryCount = ctfEntriesByDivision.get(label) ?? 0
      const linkedCount = divisionLinkedCompetitors.get(label) ?? 0
      const participationRate = linkedCount === 0 ? 0 : Math.round((participantCount / linkedCount) * 100)
      return {
        label,
        value: participantCount,
        secondary: `${formatNumber(entryCount)} event ${entryCount === 1 ? 'entry' : 'entries'}${linkedCount ? ` • ${participationRate}% of linked competitors` : ''}`,
      }
    })
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))

  const divisionChallengeRows: MetricRow[] = Array.from(divisionSolveTotals.entries())
    .map(([label, value]) => ({
      label,
      value,
      secondary: `${formatNumber(divisionLinkedCompetitors.get(label) ?? 0)} linked competitors`,
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))

  const rawTopicRows: MetricRow[] = Array.from(topicCounts.entries())
    .map(([label, value]) => ({
      label,
      value,
      secondary: `${platformChallengeSolves.length === 0 ? 0 : Math.round((value / platformChallengeSolves.length) * 100)}% of solves`,
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))

  const topicClusterRows: MetricRow[] = rawTopicRows.length <= 8
    ? rawTopicRows
    : [
        ...rawTopicRows.slice(0, 7),
        {
          label: 'Other',
          value: rawTopicRows.slice(7).reduce((sum, row) => sum + row.value, 0),
          secondary: `${Math.round((rawTopicRows.slice(7).reduce((sum, row) => sum + row.value, 0) / Math.max(platformChallengeSolves.length, 1)) * 100)}% of solves`,
        },
      ]

  const pct = (n: number | null | undefined) => {
    const total = competitorCount || 0
    return total === 0 ? 0 : Math.round(((n || 0) / total) * 100)
  }

  // Team summary rows (grouped by division via tabs in the client component)
  const coachInfoMap = new Map<string, { name: string; school: string }>()
  for (const c of (coaches || []) as Array<any>) {
    coachInfoMap.set(c.id, {
      name: c.full_name || c.email || '—',
      school: c.school_name || '—',
    })
  }

  const teamIdByCompetitorId = new Map<string, string>()
  for (const tm of (allTeamMembers || []) as Array<any>) {
    if (tm.team_id && tm.competitor_id) {
      teamIdByCompetitorId.set(tm.competitor_id, tm.team_id)
    }
  }

  const competitorsByTeamId = new Map<string, Array<{
    id: string
    status: string | null
    years_competing: number | null
    game_platform_id: string | null
  }>>()
  for (const comp of (allCompetitors || []) as Array<any>) {
    const tid = teamIdByCompetitorId.get(comp.id)
    if (!tid) continue
    const list = competitorsByTeamId.get(tid) ?? []
    list.push({
      id: comp.id,
      status: comp.status ?? null,
      years_competing: typeof comp.years_competing === 'number' ? comp.years_competing : null,
      game_platform_id: comp.game_platform_id ?? null,
    })
    competitorsByTeamId.set(tid, list)
  }

  const pointsBySyncedUserId = new Map<string, number>()
  for (const solve of platformChallengeSolves) {
    const points = typeof solve.challenge_points === 'number' ? solve.challenge_points : 0
    pointsBySyncedUserId.set(
      solve.synced_user_id,
      (pointsBySyncedUserId.get(solve.synced_user_id) ?? 0) + points,
    )
  }

  const teamSummaryData: TeamSummaryRow[] = []
  for (const team of (allTeams || []) as Array<any>) {
    if (coachId && team.coach_id !== coachId) continue
    const members = competitorsByTeamId.get(team.id) ?? []
    let activeStudents = 0
    let firstTimers = 0
    let firstTimersWithExperienceKnown = 0
    let teamPoints = 0
    for (const m of members) {
      const isPending = m.status === 'pending'
      if (!isPending) {
        activeStudents += 1
        if (typeof m.years_competing === 'number') {
          firstTimersWithExperienceKnown += 1
          if (m.years_competing === 0) firstTimers += 1
        }
      }
      const syncedId = m.game_platform_id || syncedUserIdByCompetitorId.get(m.id) || null
      if (syncedId) {
        teamPoints += pointsBySyncedUserId.get(syncedId) ?? 0
      }
    }
    const coach = coachInfoMap.get(team.coach_id) ?? { name: '—', school: '—' }
    teamSummaryData.push({
      team_id: team.id,
      team_name: team.name || '(unnamed team)',
      division: team.division ?? null,
      coach_name: coach.name,
      school_name: coach.school,
      active_students: activeStudents,
      first_timers: firstTimers,
      first_timers_with_experience_known: firstTimersWithExperienceKnown,
      total_challenge_points: teamPoints,
    })
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

        <AnalyticsSharePanel />

        {/* Coach selector + Stat tiles */}
        <form className="flex items-center justify-between" action="/dashboard/admin-tools/analytics" method="get">
          <div className="text-sm text-meta-muted">Filter by Coach</div>
          <div className="flex items-center gap-2">
            <select name="coach_id" defaultValue={coachId || ''} className="bg-meta-card border border-meta-border text-meta-light px-3 py-2 rounded">
              <option value="">All Coaches</option>
              {(coaches || []).map((c: any) => (
                <option key={c.id} value={c.id}>
                  {(c.full_name || c.email) + `(${coachCountMap.get(c.id) ?? 0})`}
                </option>
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

        {/* Coach summary grid */}
        <div className="rounded border border-meta-border bg-meta-card p-5">
          <div className="mb-4">
            <div className="text-sm text-meta-muted">Management</div>
            <div className="text-meta-light text-lg font-semibold">Coach Summary</div>
            <p className="text-sm text-meta-muted mt-1">
              Click a coach to view their competitors in the dashboard.
            </p>
          </div>
          <CoachSummaryTable data={coachSummaryData} />
        </div>

        <div className="rounded border border-meta-border bg-meta-card p-5">
          <div className="mb-4">
            <div className="text-sm text-meta-muted">Teams</div>
            <div className="text-meta-light text-lg font-semibold">Team Summary</div>
            <p className="text-sm text-meta-muted mt-1">
              Switch between divisions to compare teams by first-timer ratio, roster size, and total challenge points.
            </p>
          </div>
          <TeamSummaryTable data={teamSummaryData} />
        </div>

        <div className="rounded border border-meta-border bg-meta-card p-5">
          <div className="mb-4">
            <div className="text-sm text-meta-muted">School Locations</div>
            <div className="text-meta-light text-lg font-semibold">Geographic Distribution</div>
            <p className="text-sm text-meta-muted mt-1">
              Uses stored school coordinates from coach profiles only. No live geocoding happens in analytics.
            </p>
          </div>
          <SchoolDistributionMap points={schoolMapPoints} />
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
                {k: 'in_the_game_not_compliant', label: 'In The Game NC', color: 'bg-blue-500'},
                {k: 'complete', label: 'In The Game', color: 'bg-green-500'},
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

        <div className="rounded border border-meta-border bg-meta-card p-5">
          <div className="mb-4">
            <div className="text-sm text-meta-muted">Division & College Track</div>
            <div className="text-meta-light text-lg font-semibold">Enrollment Mix</div>
          </div>
          <DemographicCharts charts={[divisionChart]} columns={1} />
        </div>

        <div className="rounded border border-meta-border bg-meta-card p-5">
          <div className="mb-4">
            <div className="text-sm text-meta-muted">Demographics</div>
            <div className="text-meta-light text-lg font-semibold">Competitor Breakdown</div>
            <p className="text-sm text-meta-muted mt-1">
              Includes only competitors who are Profile or above, filtered by the current coach context.
            </p>
          </div>
          <DemographicCharts charts={demographicCharts} />
        </div>

        {/* Game platform analytics */}
        <div className="rounded border border-meta-border bg-meta-card p-5">
          <div className="mb-4">
            <div className="text-sm text-meta-muted">Game Platform</div>
            <div className="text-meta-light text-lg font-semibold">Challenge & Activity Analytics</div>
            <p className="mt-1 text-sm text-meta-muted">
              Total challenges solved comes from synced aggregate stats. School-day activity is calculated from timestamped solve and Flash CTF records in Pacific time, Monday-Friday, 9am-3pm.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="rounded border border-meta-border/50 bg-meta-dark/50 p-4">
              <div className="text-sm text-meta-muted">Total Challenges Solved</div>
              <div className="mt-2 text-4xl font-extrabold tracking-wider text-meta-light">{formatNumber(totalChallengesSolved)}</div>
              <div className="mt-2 text-sm text-meta-muted">
                Across {formatNumber(linkedPlatformCompetitors)} linked competitors in the current scope.
              </div>
            </div>

            <div className="rounded border border-meta-border/50 bg-meta-dark/50 p-4">
              <div className="text-sm text-meta-muted">Outside School Day Activity</div>
              <div className="mt-2 flex items-end gap-3">
                <div className="text-4xl font-extrabold tracking-wider text-meta-light">{formatNumber(activityCounts.outsideSchool)}</div>
                <div className="pb-1 text-sm text-meta-muted">
                  {outsideSchoolPct}% of {formatNumber(recordedActivityCount)} timestamped events
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-meta-dark">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-500 via-amber-400 to-yellow-300"
                  style={{ width: `${outsideSchoolPct}%` }}
                />
              </div>
              <div className="mt-2 text-xs text-meta-muted">
                Separate denominator from total challenges solved.
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-meta-muted">
                <div className="rounded border border-meta-border/40 bg-meta-card/40 p-2">
                  <div>Before 9am</div>
                  <div className="mt-1 text-sm font-semibold text-meta-light">{formatNumber(activityCounts.weekdayBeforeSchool)}</div>
                </div>
                <div className="rounded border border-meta-border/40 bg-meta-card/40 p-2">
                  <div>After 3pm</div>
                  <div className="mt-1 text-sm font-semibold text-meta-light">{formatNumber(activityCounts.weekdayAfterSchool)}</div>
                </div>
                <div className="rounded border border-meta-border/40 bg-meta-card/40 p-2">
                  <div>Weekend</div>
                  <div className="mt-1 text-sm font-semibold text-meta-light">{formatNumber(activityCounts.weekend)}</div>
                </div>
              </div>
            </div>

            <div className="rounded border border-meta-border/50 bg-meta-dark/50 p-4">
              <div className="text-sm text-meta-muted">Flash CTF Participation</div>
              <div className="mt-2 text-4xl font-extrabold tracking-wider text-meta-light">
                {formatNumber(ctfParticipationRows.reduce((sum, row) => sum + row.value, 0))}
              </div>
              <div className="mt-2 text-sm text-meta-muted">
                Unique competitors with at least one Flash CTF event in the current scope.
              </div>
              <div className="mt-3 text-sm text-meta-muted">
                {formatNumber(platformFlashEvents.length)} total event {platformFlashEvents.length === 1 ? 'entry' : 'entries'}
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className="rounded border border-meta-border/50 bg-meta-dark/30 p-4">
              <div className="mb-3">
                <div className="text-sm text-meta-muted">Flash CTF</div>
                <div className="text-base font-semibold text-meta-light">Participation by Division</div>
              </div>
              <MetricBarList
                rows={ctfParticipationRows}
                emptyMessage="No Flash CTF participation found for the current scope."
              />
            </div>

            <div className="rounded border border-meta-border/50 bg-meta-dark/30 p-4">
              <div className="mb-3">
                <div className="text-sm text-meta-muted">Game Platform</div>
                <div className="text-base font-semibold text-meta-light">Challenges Solved by Division</div>
              </div>
              <MetricBarList
                rows={divisionChallengeRows}
                emptyMessage="No linked game platform competitors found for the current scope."
              />
            </div>
          </div>

          <div className="mt-6 rounded border border-meta-border/50 bg-meta-dark/30 p-4">
            <div className="mb-3">
              <div className="text-sm text-meta-muted">Challenge Solves</div>
              <div className="text-base font-semibold text-meta-light">Topic Clustering</div>
              <p className="mt-1 text-sm text-meta-muted">
                Categories are normalized from challenge metadata and grouped into the dominant topic clusters.
              </p>
            </div>
            <MetricBarList
              rows={topicClusterRows}
              emptyMessage="No challenge solve topics found for the current scope."
            />
          </div>
        </div>
      </div>
    </div>
  )
}
