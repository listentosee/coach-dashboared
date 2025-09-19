import type { SupabaseClient } from '@supabase/supabase-js';
import { GamePlatformClient, GamePlatformClientMock, CreateUserPayload, CreateTeamPayload } from './client';
import { calculateCompetitorStatus } from '@/lib/utils/competitor-status';

export type AnySupabaseClient = SupabaseClient<any, any, any>;

export interface ServiceOptions {
  supabase: AnySupabaseClient;
  client?: GamePlatformClient | GamePlatformClientMock;
  dryRun?: boolean;
  logger?: Pick<Console, 'error' | 'warn' | 'info' | 'debug'>;
}

export interface OnboardCompetitorParams extends ServiceOptions {
  competitorId: string;
}

export interface SyncTeamParams extends ServiceOptions {
  teamId: string;
}

export interface OnboardResult {
  status: 'synced' | 'skipped_requires_compliance' | 'skipped_already_synced' | 'mocked';
  competitor: any;
  remote?: any;
}

export interface SyncTeamResult {
  status: 'synced' | 'created_team' | 'mocked' | 'skipped_missing_team' | 'skipped_missing_coach_mapping';
  team: any;
  assignedMembers?: Array<{ competitorId: string; remote?: any }>;
  skippedMembers?: Array<{ competitorId: string; reason: string }>;
}

export interface SyncCompetitorStatsParams extends ServiceOptions {
  competitorId: string;
}

export interface SyncAllCompetitorStatsParams extends ServiceOptions {
  coachId?: string | null;
}

export interface SyncCompetitorStatsResult {
  competitorId: string;
  status: 'synced' | 'skipped_no_platform_id' | 'dry-run';
  message?: string;
}

const FEATURE_ENABLED = process.env.GAME_PLATFORM_INTEGRATION_ENABLED === 'true';

function resolveClient(client?: GamePlatformClient | GamePlatformClientMock, logger?: Pick<Console, 'error' | 'warn' | 'info'>) {
  if (client) return client;
  try {
    return new GamePlatformClient({ logger });
  } catch (error) {
    throw error;
  }
}

function isDryRunOverride(dryRun?: boolean): boolean {
  if (typeof dryRun === 'boolean') return dryRun;
  return !FEATURE_ENABLED;
}

export async function onboardCompetitorToGamePlatform({
  supabase,
  client,
  competitorId,
  dryRun,
  logger,
}: OnboardCompetitorParams): Promise<OnboardResult> {
  const effectiveDryRun = isDryRunOverride(dryRun);

  const { data: competitor, error } = await supabase
    .from('competitors')
    .select('*')
    .eq('id', competitorId)
    .single();

  if (error || !competitor) {
    throw new Error(`Competitor ${competitorId} not found: ${error?.message ?? 'unknown error'}`);
  }

  if (competitor.status !== 'compliance') {
    return { status: 'skipped_requires_compliance', competitor };
  }

  if (competitor.game_platform_id) {
    return { status: 'skipped_already_synced', competitor };
  }

  const userPayload: CreateUserPayload = {
    first_name: competitor.first_name,
    last_name: competitor.last_name,
    email: competitor.email_school || competitor.email_personal,
    preferred_username: buildPreferredUsername(competitor),
    role: 'user',
    syned_school_id: competitor.syned_school_id ?? null,
    syned_region_id: competitor.syned_region_id ?? null,
    syned_coach_user_id: competitor.syned_coach_user_id ?? null,
    syned_user_id: String(competitor.game_platform_id ?? competitor.id),
  };

  if (!userPayload.email) {
    await updateCompetitorSyncError(supabase, competitorId, 'Missing email for Game Platform onboarding');
    throw new Error('Competitor is missing required email for Game Platform onboarding');
  }

  try {
    if (effectiveDryRun) {
      return {
        status: 'mocked',
        competitor,
        remote: {
          mocked: true,
          expectedPayload: userPayload,
        },
      };
    }

    const resolvedClient = resolveClient(client, logger);
    const remoteResult = await resolvedClient.createUser(userPayload);
    const remoteUserId = (remoteResult as any)?.syned_user_id ?? (remoteResult as any)?.id ?? null;

    if (!remoteUserId) {
      await updateCompetitorSyncError(supabase, competitorId, 'Game Platform did not return a syned_user_id');
      throw new Error('Game Platform did not return a syned_user_id');
    }

    const updatedCompetitor = await persistCompetitorSyncSuccess(supabase, competitorId, competitor, remoteUserId);

    try {
      await syncCompetitorGameStats({
        supabase,
        client: resolvedClient,
        competitorId,
        dryRun: false,
        logger,
      });
    } catch (syncErr) {
      logger?.warn?.('Post-onboarding stats sync failed', { competitorId, error: syncErr });
    }

    return {
      status: 'synced',
      competitor: updatedCompetitor,
      remote: remoteResult,
    };
  } catch (error: any) {
    logger?.error?.('Failed to onboard competitor to Game Platform', { competitorId, error });
    await updateCompetitorSyncError(supabase, competitorId, error?.message ?? 'Unknown error');
    throw error;
  }
}

export async function syncTeamWithGamePlatform({
  supabase,
  client,
  teamId,
  dryRun,
  logger,
}: SyncTeamParams): Promise<SyncTeamResult> {
  const effectiveDryRun = isDryRunOverride(dryRun);

  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('*')
    .eq('id', teamId)
    .single();

  if (teamError || !team) {
    return {
      status: 'skipped_missing_team',
      team: null,
    };
  }

  if (!team.syned_coach_user_id && !team.coach_game_platform_id) {
    await updateTeamSyncError(supabase, teamId, 'Missing Game Platform coach mapping');
    return {
      status: 'skipped_missing_coach_mapping',
      team,
    };
  }

  const teamPayload: CreateTeamPayload = {
    syned_coach_user_id: team.syned_coach_user_id ?? team.coach_game_platform_id,
    syned_team_id: team.game_platform_id ?? team.id,
    team_name: team.name,
    affiliation: team.affiliation ?? 'Unknown',
    division: sanitizeDivision(team.division),
  };

  const resolvedClient = effectiveDryRun ? undefined : resolveClient(client, logger);
  let remoteTeamId = team.game_platform_id ?? null;
  let remoteTeamResponse: any = null;
  let createdTeam = false;

  if (!effectiveDryRun && !remoteTeamId) {
    remoteTeamResponse = await (resolvedClient as GamePlatformClient).createTeam(teamPayload);
    remoteTeamId = (remoteTeamResponse as any)?.syned_team_id ?? null;
    createdTeam = true;

    if (!remoteTeamId) {
      await updateTeamSyncError(supabase, teamId, 'Game Platform did not return a syned_team_id');
      throw new Error('Game Platform did not return a syned_team_id');
    }

    await persistTeamSyncSuccess(supabase, teamId, team, remoteTeamId);
  }

  const { data: teamMembers, error: membersError } = await supabase
    .from('team_members')
    .select('competitor_id')
    .eq('team_id', teamId);

  if (membersError) {
    throw new Error(`Failed to fetch team members: ${membersError.message}`);
  }

  const competitorIds = (teamMembers ?? []).map((m) => m.competitor_id);
  const assignedMembers: Array<{ competitorId: string; remote?: any }> = [];
  const skippedMembers: Array<{ competitorId: string; reason: string }> = [];

  if (competitorIds.length) {
    const { data: competitors, error: competitorsError } = await supabase
      .from('competitors')
      .select('id, first_name, last_name, game_platform_id')
      .in('id', competitorIds);

    if (competitorsError) {
      throw new Error(`Failed to fetch competitors for team sync: ${competitorsError.message}`);
    }

    for (const member of competitors ?? []) {
      if (!member.game_platform_id) {
        skippedMembers.push({
          competitorId: member.id,
          reason: 'Competitor missing game_platform_id',
        });
        continue;
      }

      if (effectiveDryRun) {
        assignedMembers.push({ competitorId: member.id, remote: { mocked: true } });
        continue;
      }

      const payload = {
        syned_team_id: remoteTeamId,
        syned_user_id: member.game_platform_id,
      };

      const result = await (resolvedClient as GamePlatformClient).assignMemberToTeam(payload);
      assignedMembers.push({ competitorId: member.id, remote: result });
    }
  }

  if (effectiveDryRun) {
    return {
      status: 'mocked',
      team,
      assignedMembers,
      skippedMembers,
    };
  }

  await updateTeamSyncError(supabase, teamId, null);

  return {
    status: createdTeam ? 'created_team' : 'synced',
    team: {
      ...team,
      game_platform_id: remoteTeamId,
    },
    assignedMembers,
    skippedMembers,
  };
}

function buildPreferredUsername(competitor: any): string {
  if (competitor.preferred_username) return competitor.preferred_username;
  const source = competitor.email_personal || competitor.email_school || `${competitor.first_name}.${competitor.last_name}`;
  const cleaned = String(source)
    .split('@')[0]
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 32);
  if (cleaned.length >= 3) return cleaned;
  const fallback = `competitor-${String(competitor.id || Date.now()).replace(/[^a-zA-Z0-9]/g, '')}`;
  return fallback.slice(0, 32);
}

async function updateCompetitorSyncError(supabase: AnySupabaseClient, competitorId: string, message: string | null) {
  await supabase
    .from('competitors')
    .update({
      game_platform_sync_error: message,
      ...(message ? {} : { game_platform_synced_at: new Date().toISOString() }),
    })
    .eq('id', competitorId);
}

async function persistCompetitorSyncSuccess(
  supabase: AnySupabaseClient,
  competitorId: string,
  competitor: any,
  remoteUserId: string,
) {
  const nextStatus = calculateCompetitorStatus({ ...competitor, game_platform_id: remoteUserId });
  const { data, error } = await supabase
    .from('competitors')
    .update({
      game_platform_id: remoteUserId,
      game_platform_synced_at: new Date().toISOString(),
      game_platform_sync_error: null,
      status: nextStatus,
    })
    .eq('id', competitorId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to persist competitor Game Platform state: ${error.message}`);
  }

  return data;
}

async function persistTeamSyncSuccess(supabase: AnySupabaseClient, teamId: string, team: any, remoteTeamId: string) {
  const { data, error } = await supabase
    .from('teams')
    .update({
      game_platform_id: remoteTeamId,
      game_platform_synced_at: new Date().toISOString(),
      game_platform_sync_error: null,
    })
    .eq('id', teamId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to persist team Game Platform state: ${error.message}`);
  }

  return data ?? { ...team, game_platform_id: remoteTeamId };
}

async function updateTeamSyncError(supabase: AnySupabaseClient, teamId: string, message: string | null) {
  await supabase
    .from('teams')
    .update({
      game_platform_sync_error: message,
      ...(message ? {} : { game_platform_synced_at: new Date().toISOString() }),
    })
    .eq('id', teamId);
}

function sanitizeDivision(raw: string | null | undefined): 'high_school' | 'middle_school' | 'college' {
  switch (raw) {
    case 'high_school':
    case 'middle_school':
    case 'college':
      return raw;
    case 'highschool':
    case 'high-school':
      return 'high_school';
    case 'middleschool':
    case 'middle-school':
      return 'middle_school';
    default:
      return 'high_school';
  }
}

async function getOrCreateStatsRow(
  supabase: AnySupabaseClient,
  competitorId: string,
) {
  const { data, error } = await supabase
    .from('game_platform_stats')
    .select('id')
    .eq('competitor_id', competitorId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load existing stats row: ${error.message}`);
  }

  return data;
}

export async function syncCompetitorGameStats({
  supabase,
  client,
  competitorId,
  dryRun,
  logger,
}: SyncCompetitorStatsParams): Promise<SyncCompetitorStatsResult> {
  const { data: competitor, error } = await supabase
    .from('competitors')
    .select('id, first_name, last_name, coach_id, game_platform_id')
    .eq('id', competitorId)
    .maybeSingle();

  if (error || !competitor) {
    throw new Error(`Competitor ${competitorId} not found: ${error?.message ?? 'unknown error'}`);
  }

  if (!competitor.game_platform_id) {
    return {
      competitorId,
      status: 'skipped_no_platform_id',
      message: 'Competitor missing game_platform_id',
    };
  }

  const effectiveDryRun = isDryRunOverride(dryRun);

  if (effectiveDryRun) {
    return {
      competitorId,
      status: 'dry-run',
    };
  }

  const resolvedClient = resolveClient(client, logger);

  let scores: any = null;
  try {
    scores = await resolvedClient.getScores({ syned_user_id: competitor.game_platform_id });
  } catch (err: any) {
    logger?.warn?.(`Failed to fetch ODL scores for ${competitor.game_platform_id}`, { error: err });
  }

  let flash: any = null;
  try {
    flash = await resolvedClient.getFlashCtfProgress({ syned_user_id: competitor.game_platform_id });
  } catch (err: any) {
    if (err?.status === 404) {
      logger?.info?.(`No Flash CTF progress for ${competitor.game_platform_id}`);
    } else {
      logger?.warn?.(`Failed to fetch Flash CTF progress for ${competitor.game_platform_id}`, { error: err });
    }
  }

  const normalizedScores = Array.isArray(scores) ? scores[0] : scores;
  const totalChallenges = normalizedScores?.total_challenges_solved ?? 0;
  const totalPoints = normalizedScores?.total_points ?? 0;
  const lastActivityUnix = normalizedScores?.last_accessed_unix_timestamp ?? null;
  const lastActivity = lastActivityUnix ? new Date(lastActivityUnix * 1000).toISOString() : null;
  const flashEntries: any[] = flash?.flash_ctfs ?? [];
  const monthlyCtfChallenges = flashEntries.reduce((sum, entry) => sum + (entry?.challenges_solved ?? 0), 0);

  const rawData = {
    scores: normalizedScores ?? null,
    flash_ctfs: flashEntries,
  };

  const existing = await getOrCreateStatsRow(supabase, competitorId);

  const payload: any = {
    competitor_id: competitorId,
    challenges_completed: totalChallenges,
    monthly_ctf_challenges: monthlyCtfChallenges,
    total_score: totalPoints,
    last_activity: lastActivity,
    synced_at: new Date().toISOString(),
    raw_data: rawData,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from('game_platform_stats')
      .update(payload)
      .eq('id', existing.id);
    if (updateError) {
      throw new Error(`Failed to update game platform stats: ${updateError.message}`);
    }
  } else {
    const { error: insertError } = await supabase
      .from('game_platform_stats')
      .insert(payload);
    if (insertError) {
      throw new Error(`Failed to insert game platform stats: ${insertError.message}`);
    }
  }

  return {
    competitorId,
    status: 'synced',
  };
}

export async function syncAllCompetitorGameStats({
  supabase,
  client,
  dryRun,
  logger,
  coachId,
}: SyncAllCompetitorStatsParams) {
  let competitorQuery = supabase
    .from('competitors')
    .select('id, coach_id, game_platform_id')
    .not('game_platform_id', 'is', null);

  if (coachId) {
    competitorQuery = competitorQuery.eq('coach_id', coachId);
  }

  const { data: competitors, error } = await competitorQuery;

  if (error) {
    throw new Error(`Failed to list competitors for stats sync: ${error.message}`);
  }

  const results: SyncCompetitorStatsResult[] = [];

  for (const competitor of competitors || []) {
    const result = await syncCompetitorGameStats({
      supabase,
      client,
      competitorId: competitor.id,
      dryRun,
      logger,
    });
    results.push(result);
  }

  return {
    total: competitors?.length ?? 0,
    synced: results.filter((r) => r.status === 'synced').length,
    skipped: results.filter((r) => r.status !== 'synced').length,
    results,
  };
}
