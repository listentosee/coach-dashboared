import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { GamePlatformClient, CreateUserPayload, CreateTeamPayload } from './client';
import { calculateCompetitorStatus } from '@/lib/utils/competitor-status';
import {
  getGamePlatformProfile,
  upsertGamePlatformProfile,
  updateGamePlatformProfile,
  getGamePlatformTeamByTeamId,
  upsertGamePlatformTeam,
  updateGamePlatformTeam,
} from './repository';
import type { GamePlatformSyncStatus } from './repository';

export type AnySupabaseClient = SupabaseClient<any, any, any>;

export interface ServiceOptions {
  supabase: AnySupabaseClient;
  client?: GamePlatformClient;
  dryRun?: boolean;
  logger?: Pick<Console, 'error' | 'warn' | 'info' | 'debug'>;
}

export interface OnboardCompetitorParams extends ServiceOptions {
  competitorId: string;
  coachContextId?: string | null;
}

export interface OnboardCoachParams extends ServiceOptions {
  coachId: string;
}

export interface SyncTeamParams extends ServiceOptions {
  teamId: string;
}

export interface OnboardResult {
  status: 'synced' | 'skipped_requires_profile' | 'skipped_already_synced' | 'dry_run';
  competitor: any;
  remote?: any;
}

export interface OnboardCoachResult {
  status: 'synced' | 'dry_run';
  coachId: string;
  syncedUserId?: string | null;
  remote?: any;
}

export interface SyncTeamResult {
  status: 'synced' | 'created_team' | 'dry_run' | 'skipped_missing_team' | 'skipped_missing_coach_mapping';
  team: any;
  assignedMembers?: Array<{ competitorId: string; remote?: any }>;
  skippedMembers?: Array<{ competitorId: string; reason: string }>;
  unassignedMembers?: Array<{ syncedUserId: string; remote?: any }>;
}

export interface DeleteTeamParams extends ServiceOptions {
  teamId: string;
}

export interface DeleteTeamResult {
  status: 'deleted' | 'skipped_not_synced' | 'dry_run';
  team: any;
}

export interface SyncCompetitorStatsParams extends ServiceOptions {
  competitorId: string;
  globalAfterTimeUnix?: number | null;
  skipFlashCtfSync?: boolean; // Skip Flash CTF API call if no new events detected
  ctfOnly?: boolean; // Force Flash CTF sync without touching ODL state
  forceFlashCtfSync?: boolean; // Force refresh of Flash CTF data (replaces existing rows)
}

export interface SyncAllCompetitorStatsParams extends ServiceOptions {
  coachId?: string | null;
  forceFullSync?: boolean;
  forceFlashCtfSync?: boolean;
  batchSize?: number;
  cursor?: { createdAt: string; id: string } | null;
  wave?: boolean;
}

export interface RefreshGamePlatformProfilesParams extends ServiceOptions {
  coachId?: string | null;
}

export interface RefreshGamePlatformProfilesSummary {
  total: number;
  refreshed: number;
  skipped: number;
  failed: number;
  results: Array<{
    competitorId: string;
    syncedUserId?: string | null;
    status: 'refreshed' | 'skipped_no_platform_id' | 'dry-run' | 'error';
    message?: string;
  }>;
}

export interface SyncCompetitorStatsResult {
  competitorId: string;
  status: 'synced' | 'skipped_no_platform_id' | 'skipped_remote_missing' | 'skipped_no_new_data' | 'dry-run' | 'error';
  message?: string;
}

export interface SyncAllCompetitorStatsSummary {
  total: number;
  synced: number;
  skipped: number;
  results: SyncCompetitorStatsResult[];
  nextCursor?: { createdAt: string; id: string } | null;
  wrapped?: boolean;
  batchSize?: number;
}

const FEATURE_ENABLED = process.env.GAME_PLATFORM_INTEGRATION_ENABLED === 'true';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GAME_PLATFORM_BASE_URL =
  process.env.META_CTF_BASE_URL ?? process.env.GAME_PLATFORM_API_BASE_URL ?? '';
const ALLOWED_SYNC_STATUSES: GamePlatformSyncStatus[] = ['pending', 'user_created', 'approved', 'denied', 'error'];

function normalizeSyncStatus(
  value: any,
  fallback: GamePlatformSyncStatus = 'pending',
): GamePlatformSyncStatus {
  if (typeof value === 'string' && ALLOWED_SYNC_STATUSES.includes(value as GamePlatformSyncStatus)) {
    return value as GamePlatformSyncStatus;
  }
  return fallback;
}

function resolveClient(client?: GamePlatformClient, logger?: Pick<Console, 'error' | 'warn' | 'info'>) {
  if (client) return client;
  try {
    return new GamePlatformClient({ logger });
  } catch (error) {
    throw error;
  }
}

function normalizeChallengeCategoryLabel(raw?: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;

  switch (cleaned) {
    case 'crypto':
    case 'cryptography':
      return 'Cryptography';
    case 'foren':
    case 'forensics':
      return 'Forensics';
    case 'reven':
    case 'reverse engineering':
    case 'reversing':
      return 'Reverse Engineering';
    case 'binexp':
    case 'binary exploitation':
      return 'Binary Exploitation';
    case 'osint':
      return 'OSINT';
    case 'web':
      return 'Web';
    case 'operating systems':
    case 'operating system':
    case 'os':
      return 'Operating Systems';
    case 'misc':
    case 'miscellaneous':
      return 'Miscellaneous';
    default:
      return cleaned.replace(/\b\w/g, (match) => match.toUpperCase());
  }
}

async function ensureCoachGamePlatformId(
  supabase: AnySupabaseClient,
  resolvedClient: GamePlatformClient,
  coachProfile: { id: string; email?: string | null; first_name?: string | null; last_name?: string | null; full_name?: string | null; school_name?: string | null; division?: string | null },
  logger?: Pick<Console, 'error' | 'warn' | 'info'>
): Promise<string> {
  const existingMapping = await getGamePlatformProfile(supabase, { coachId: coachProfile.id }).catch(() => null);
  if (existingMapping && existingMapping.synced_user_id && ['approved', 'user_created'].includes(existingMapping.status)) {
    return existingMapping.synced_user_id;
  }

  const firstName = coachProfile.first_name || coachProfile.full_name?.split(' ')[0] || 'Coach';
  const lastName = coachProfile.last_name || coachProfile.full_name?.split(' ').slice(1).join(' ') || 'User';
  const email = coachProfile.email || `${coachProfile.id}@mock.metactf.local`;

  const payload: CreateUserPayload = {
    first_name: firstName,
    last_name: lastName || 'User',
    email,
    preferred_username: `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z0-9._-]/g, '') || coachProfile.id,
    role: 'coach',
    syned_user_id: coachProfile.id,
    syned_school_id: coachProfile.school_name || 'Unknown School',
    syned_region_id: coachProfile.division || 'high_school',
  };

  try {
    let response: any;
    let syncedUserId: string;
    let userStatus: string | undefined;
    let username: string | undefined;

    try {
      logger?.info?.(`🔍 Checking if coach ${coachProfile.id} exists on MetaCTF`);
      response = await (resolvedClient as GamePlatformClient).getUser({ syned_user_id: coachProfile.id });
      syncedUserId = response.syned_user_id;
      userStatus = response.metactf_user_status;
      username = response.metactf_username;
      logger?.info?.(`✅ Coach ${coachProfile.id} found on MetaCTF with status: ${userStatus}`, response);
    } catch (getUserError: any) {
      if (getUserError?.status === 404) {
        logger?.info?.(`📤 Coach ${coachProfile.id} not found on MetaCTF, creating new coach with payload:`, payload);
        response = await (resolvedClient as GamePlatformClient).createUser(payload);
        syncedUserId = response.syned_user_id;
        userStatus = response.metactf_user_status;
        username = response.metactf_username;
        logger?.info?.(`✅ Created coach ${coachProfile.id} on MetaCTF:`, response);
      } else {
        throw getUserError;
      }
    }

    const status = normalizeSyncStatus(userStatus);
    const lastSyncedAt = new Date().toISOString();

    await upsertGamePlatformProfile(supabase, {
      coachId: coachProfile.id,
      metactfRole: 'coach',
      syncedUserId,
      metactfUserId: response?.metactf_user_id ?? null,
      metactfUsername: username ?? null,
      status,
      syncError: null,
      lastSyncedAt,
    });

    if (!['approved', 'user_created'].includes(status)) {
      const errorMsg = `Coach user on MetaCTF has status "${status}" and must be "approved" or "user_created" before adding competitors. Please contact MetaCTF support to approve this coach.`;
      logger?.warn?.(errorMsg, { coachId: coachProfile.id, userStatus: status });
      await updateGamePlatformProfile(
        supabase,
        { coachId: coachProfile.id },
        {
          status,
          syncError: errorMsg,
          lastSyncedAt,
        },
      );
      throw new Error(errorMsg);
    }

    return syncedUserId;
  } catch (error) {
    logger?.error?.('Failed to ensure coach Game Platform user', { coachId: coachProfile.id, error });
    throw error;
  }
}

function isDryRunOverride(dryRun?: boolean): boolean {
  // Respect feature flag: when integration is disabled, always treat as dry run
  return !FEATURE_ENABLED;
}

export async function onboardCoachToGamePlatform({
  supabase,
  client,
  coachId,
  dryRun,
  logger,
}: OnboardCoachParams): Promise<OnboardCoachResult> {
  const effectiveDryRun = isDryRunOverride(dryRun);

  const { data: coachProfile, error: coachError } = await supabase
    .from('profiles')
    .select('id, role, is_approved, email, first_name, last_name, full_name, school_name, division')
    .eq('id', coachId)
    .maybeSingle();

  if (coachError || !coachProfile) {
    throw new Error(`Coach ${coachId} not found: ${coachError?.message ?? 'unknown error'}`);
  }

  if (coachProfile.role !== 'coach') {
    throw new Error(`Profile ${coachId} is not a coach`);
  }

  const firstName = coachProfile.first_name || coachProfile.full_name?.split(' ')[0] || 'Coach';
  const lastName = coachProfile.last_name || coachProfile.full_name?.split(' ').slice(1).join(' ') || 'User';
  const email = coachProfile.email || `${coachProfile.id}@mock.metactf.local`;

  const payload: CreateUserPayload = {
    first_name: firstName,
    last_name: lastName || 'User',
    email,
    preferred_username: `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z0-9._-]/g, '') || coachProfile.id,
    role: 'coach',
    syned_user_id: coachProfile.id,
    syned_school_id: coachProfile.school_name || 'Unknown School',
    syned_region_id: coachProfile.division || 'high_school',
  };

  if (effectiveDryRun) {
    return {
      status: 'dry_run',
      coachId: coachProfile.id,
      remote: {
        dryRun: true,
        expectedPayload: payload,
      },
    };
  }

  const resolvedClient = resolveClient(client, logger);
  const syncedUserId = await ensureCoachGamePlatformId(supabase, resolvedClient, coachProfile, logger);

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      game_platform_user_id: syncedUserId,
      game_platform_last_synced_at: new Date().toISOString(),
    })
    .eq('id', coachProfile.id);

  if (updateError) {
    logger?.warn?.('Failed to update coach profile with Game Platform user ID', {
      coachId: coachProfile.id,
      error: updateError.message,
    });
  }

  return {
    status: 'synced',
    coachId: coachProfile.id,
    syncedUserId,
  };
}

export async function onboardCompetitorToGamePlatform({
  supabase,
  client,
  competitorId,
  coachContextId,
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

  if (!['profile', 'compliance'].includes(competitor.status)) {
    return { status: 'skipped_requires_profile', competitor };
  }

  const competitorMapping = await getGamePlatformProfile(supabase, { competitorId }).catch(() => null);

  const existingCompetitorStatus = competitorMapping?.status ?? null;
  if (competitorMapping?.synced_user_id && ['approved', 'user_created'].includes(existingCompetitorStatus ?? '')) {
    return { status: 'skipped_already_synced', competitor };
  }

  const coachProfileId = coachContextId ?? competitor.coach_id;

  const { data: coachProfile, error: coachError } = await supabase
    .from('profiles')
    .select('id, role, is_approved, email, first_name, last_name, full_name, school_name, division')
    .eq('id', coachProfileId ?? competitor.coach_id)
    .maybeSingle();

  if (coachError || !coachProfile || coachProfile.role !== 'coach') {
    await updateCompetitorSyncError(
      supabase,
      competitorId,
      'Coach not found or missing Game Platform mapping'
    );
    throw new Error('Coach not found or missing Game Platform mapping');
  }

  const coachMapping = await getGamePlatformProfile(supabase, { coachId: coachProfile.id }).catch(() => null);

  const resolvedClient = resolveClient(client, logger);

  let coachSyncedUserId =
    competitor.syned_coach_user_id ??
    (competitor as any).coach_game_platform_id ??
    coachMapping?.synced_user_id ??
    null;

  if (!coachSyncedUserId && !effectiveDryRun) {
    try {
      coachSyncedUserId = await ensureCoachGamePlatformId(supabase, resolvedClient, coachProfile, logger);
    } catch (coachSyncError: any) {
      await updateCompetitorSyncError(
        supabase,
        competitorId,
        coachSyncError?.message ?? 'Failed to provision coach on Game Platform'
      );
      throw coachSyncError;
    }
  }

  const userPayload: CreateUserPayload = {
    first_name: competitor.first_name,
    last_name: competitor.last_name,
    email: competitor.email_personal || competitor.email_school,
    preferred_username: buildPreferredUsername(competitor),
    role: 'user',
    // Competitors inherit school/region from coach if not set
    syned_school_id: competitor.syned_school_id ?? coachProfile.school_name ?? 'Unknown School',
    syned_region_id: competitor.syned_region_id ?? coachProfile.division ?? 'high_school',
    syned_coach_user_id: coachSyncedUserId,
    syned_user_id: String(competitorMapping?.synced_user_id ?? competitor.id),
  };

  // Log the complete payload for debugging
  logger?.info?.('📤 MetaCTF API - Creating competitor with payload:', {
    competitorId,
    payload: userPayload,
    coachProfile: {
      id: coachProfile.id,
      syned_user_id: coachSyncedUserId,
    }
  });

  if (!userPayload.syned_coach_user_id) {
    await updateCompetitorSyncError(
      supabase,
      competitorId,
      'Missing syned_coach_user_id for Game Platform onboarding'
    );
    throw new Error('syned_coach_user_id required for users');
  }

  if (!userPayload.email) {
    await updateCompetitorSyncError(supabase, competitorId, 'Missing email for Game Platform onboarding');
    throw new Error('Competitor is missing required email for Game Platform onboarding');
  }

  try {
    if (effectiveDryRun) {
      return {
        status: 'dry_run',
        competitor,
        remote: {
          dryRun: true,
          expectedPayload: userPayload,
        },
      };
    }

    logger?.info?.('🚀 Sending createUser request to MetaCTF API...');
    const remoteResult = await resolvedClient.createUser(userPayload);
    logger?.info?.('✅ MetaCTF API response:', remoteResult);
    // Store the syned_user_id (UUID) for linking, not the metactf_user_id (numeric)
    const remoteUserId = String((remoteResult as any)?.syned_user_id ?? null);

    const competitorRemoteStatus = normalizeSyncStatus((remoteResult as any)?.metactf_user_status);
    const competitorRemoteUsername = (remoteResult as any)?.metactf_username ?? null;
    const competitorRemoteId = (remoteResult as any)?.metactf_user_id ?? null;
    const competitorSyncTime = new Date().toISOString();

    if (!remoteUserId) {
      await updateCompetitorSyncError(supabase, competitorId, 'Game Platform did not return a syned_user_id');
      throw new Error('Game Platform did not return a syned_user_id');
    }

    await upsertGamePlatformProfile(supabase, {
      competitorId,
      metactfRole: 'user',
      syncedUserId: remoteUserId,
      metactfUserId: competitorRemoteId,
      metactfUsername: competitorRemoteUsername,
      status: competitorRemoteStatus,
      syncError: null,
      lastSyncedAt: competitorSyncTime,
    });

    const updatedCompetitor = await persistCompetitorSyncSuccess(
      supabase,
      competitorId,
      competitor,
      remoteUserId,
      competitorRemoteStatus,
    );

    // Create initial stats row immediately after onboarding
    const statsClient: AnySupabaseClient = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
      ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
      : supabase;

    try {
      await statsClient
        .from('game_platform_stats')
        .insert({
          competitor_id: competitorId,
          challenges_completed: 0,
          monthly_ctf_challenges: 0,
          total_score: 0,
        });
      logger?.info?.(`Created initial stats row for ${competitorId}`);
    } catch (statsErr: any) {
      // If row already exists (unlikely but possible), that's fine
      if (statsErr?.code !== '23505') { // 23505 = unique constraint violation
        logger?.warn?.('Failed to create initial stats row', { competitorId, error: statsErr });
      }
    }

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

    try {
      const { data: teamMemberships, error: teamMembershipsError } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('competitor_id', competitorId);

      if (teamMembershipsError) {
        logger?.warn?.('Unable to load team memberships after competitor onboarding', {
          competitorId,
          error: teamMembershipsError,
        });
      } else {
        const uniqueTeamIds = Array.from(
          new Set((teamMemberships ?? []).map((membership) => membership.team_id).filter(Boolean))
        ) as string[];

        for (const teamId of uniqueTeamIds) {
          try {
            await syncTeamWithGamePlatform({
              supabase,
              client: resolvedClient,
              teamId,
              dryRun: effectiveDryRun,
              logger,
            });
          } catch (teamSyncError) {
            logger?.warn?.('Failed to sync team after competitor onboarding', {
              competitorId,
              teamId,
              error: teamSyncError,
            });
          }
        }
      }
    } catch (membershipSyncError) {
      logger?.warn?.('Error during team reconciliation post onboarding', {
        competitorId,
        error: membershipSyncError,
      });
    }

    return {
      status: 'synced',
      competitor: updatedCompetitor,
      remote: remoteResult,
    };
  } catch (error: any) {
    logger?.error?.('❌ Failed to onboard competitor to Game Platform', {
      competitorId,
      error: error?.message,
      errorDetails: error,
      payload: userPayload
    });
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

  const teamMapping = await getGamePlatformTeamByTeamId(supabase, teamId).catch(() => null);

  if (!team.syned_coach_user_id && !team.coach_game_platform_id && !team.coach_id) {
    await updateTeamSyncError(supabase, teamId, 'Missing Game Platform coach mapping');
    return {
      status: 'skipped_missing_coach_mapping',
      team,
    };
  }

  const { data: coachProfile, error: coachError } = await supabase
    .from('profiles')
    .select('id, role, is_approved, email, first_name, last_name, full_name, school_name, division')
    .eq('id', team.syned_coach_user_id ?? team.coach_id)
    .maybeSingle();

  if (
    coachError ||
    !coachProfile ||
    coachProfile.role !== 'coach' ||
    coachProfile.is_approved === false
  ) {
    await updateTeamSyncError(supabase, teamId, 'Coach not found or not approved connection');
    throw new Error('Coach not found or not approved connection');
  }

  const resolvedClient = resolveClient(client, logger);

  let coachMetaId =
    team.syned_coach_user_id ??
    team.coach_game_platform_id ??
    coachProfile.game_platform_user_id ??
    null;

  if (!coachMetaId && !effectiveDryRun) {
    coachMetaId = await ensureCoachGamePlatformId(supabase, resolvedClient, coachProfile, logger);
  }

  const affiliationFallback = (team.affiliation && team.affiliation.trim().length > 0)
    ? team.affiliation
    : coachProfile.school_name ?? 'Unknown';

  const divisionSource = team.division ?? null;
  const existingSyncedTeamId = team.game_platform_id ?? teamMapping?.synced_team_id ?? null;

  const teamPayload: CreateTeamPayload = {
    syned_coach_user_id: coachMetaId,
    syned_team_id: existingSyncedTeamId ?? team.id,
    team_name: team.name,
    affiliation: affiliationFallback,
    division: sanitizeDivision(divisionSource),
  };

  if (!teamPayload.syned_coach_user_id) {
    await updateTeamSyncError(supabase, teamId, 'Missing Game Platform coach mapping');
    return {
      status: 'skipped_missing_coach_mapping',
      team,
    };
  }

  const resolvedClientInstance = effectiveDryRun ? undefined : resolvedClient;
  let remoteTeamId = existingSyncedTeamId;
  let remoteTeamResponse: any = null;
  let createdTeam = false;

  if (!effectiveDryRun && !remoteTeamId) {
    remoteTeamResponse = await (resolvedClientInstance as GamePlatformClient).createTeam(teamPayload);
    remoteTeamId = (remoteTeamResponse as any)?.syned_team_id ?? null;
    createdTeam = true;

    if (!remoteTeamId) {
      await updateTeamSyncError(supabase, teamId, 'Game Platform did not return a syned_team_id');
      throw new Error('Game Platform did not return a syned_team_id');
    }
  }

  let persistedTeam: any = null;
  if (!effectiveDryRun && remoteTeamId) {
    const metaStatus = remoteTeamResponse
      ? normalizeSyncStatus((remoteTeamResponse as any)?.status, 'approved')
      : teamMapping?.status
      ? normalizeSyncStatus(teamMapping.status, 'approved')
      : 'approved';

    persistedTeam = await persistTeamSyncSuccess(
      supabase,
      teamId,
      team,
      remoteTeamId,
      coachMetaId,
      {
        syncedTeamId: remoteTeamId,
        metactfTeamId:
          (remoteTeamResponse as any)?.metactf_team_id ?? teamMapping?.metactf_team_id ?? null,
        metactfTeamName:
          (remoteTeamResponse as any)?.team_name ?? teamMapping?.metactf_team_name ?? team.name,
        status: metaStatus,
      },
    );
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
  const unassignedMembers: Array<{ syncedUserId: string; remote?: any }> = [];

  // Get current team assignments from MetaCTF to detect members that need to be removed
  if (!effectiveDryRun && remoteTeamId) {
    try {
      const remoteAssignments = await (resolvedClientInstance as GamePlatformClient).getTeamAssignments({
        syned_team_id: remoteTeamId,
      });

      // Get game_platform_ids of local team members
      const { data: localCompetitors, error: localCompetitorsError } = await supabase
        .from('competitors')
        .select('id, game_platform_id')
        .in('id', competitorIds.length ? competitorIds : ['00000000-0000-0000-0000-000000000000']); // Use dummy UUID if no members

      if (localCompetitorsError) {
        logger?.warn?.('Failed to fetch local competitors for unassignment check', { error: localCompetitorsError });
      }

      const localGamePlatformIds = new Set(
        (localCompetitors ?? [])
          .map(c => c.game_platform_id)
          .filter(Boolean)
      );

      // Find members in MetaCTF that are not in local database
      const membersToUnassign = (remoteAssignments.assignments || [])
        .filter((assignment: any) => !localGamePlatformIds.has(assignment.syned_user_id))
        .map((assignment: any) => assignment.syned_user_id);

      // Unassign members who are no longer in the local team
      for (const syncedUserId of membersToUnassign) {
        try {
          const unassignResult = await (resolvedClientInstance as GamePlatformClient).unassignMemberFromTeam({
            syned_user_id: syncedUserId,
          });
          unassignedMembers.push({ syncedUserId, remote: unassignResult });
          logger?.info?.(`Unassigned member ${syncedUserId} from team ${remoteTeamId}`);
        } catch (unassignError: any) {
          logger?.warn?.(`Failed to unassign member ${syncedUserId} from team ${remoteTeamId}`, { error: unassignError });
        }
      }
    } catch (assignmentsError: any) {
      logger?.warn?.('Failed to fetch remote team assignments for unassignment check', { error: assignmentsError });
    }
  }

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
        assignedMembers.push({ competitorId: member.id, remote: { dryRun: true } });
        continue;
      }

      const payload = {
        syned_team_id: remoteTeamId,
        syned_user_id: member.game_platform_id,
      };

    const result = await (resolvedClientInstance as GamePlatformClient).assignMemberToTeam(payload);
      assignedMembers.push({ competitorId: member.id, remote: result });
    }
  }

  if (effectiveDryRun) {
    return {
      status: 'dry_run',
      team,
      assignedMembers,
      skippedMembers,
      unassignedMembers,
    };
  }

  await updateTeamSyncError(supabase, teamId, null);

  const finalTeam = persistedTeam ?? {
    ...team,
    game_platform_id: remoteTeamId ?? team.game_platform_id,
  };

  return {
    status: createdTeam ? 'created_team' : 'synced',
    team: finalTeam,
    assignedMembers,
    skippedMembers,
    unassignedMembers,
  };
}

export async function deleteTeamFromGamePlatform({
  supabase,
  client,
  teamId,
  dryRun,
  logger,
}: DeleteTeamParams): Promise<DeleteTeamResult> {
  const effectiveDryRun = isDryRunOverride(dryRun);

  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('*')
    .eq('id', teamId)
    .single();

  if (teamError || !team) {
    throw new Error(`Team ${teamId} not found: ${teamError?.message ?? 'unknown error'}`);
  }

  const teamMapping = await getGamePlatformTeamByTeamId(supabase, teamId).catch(() => null);
  const remoteTeamId = team.game_platform_id ?? teamMapping?.synced_team_id ?? null;

  if (!remoteTeamId) {
    logger?.info?.(`Team ${teamId} has no game_platform_id, skipping remote deletion`);
    return {
      status: 'skipped_not_synced',
      team,
    };
  }

  if (effectiveDryRun) {
    return {
      status: 'dry_run',
      team,
    };
  }

  const resolvedClient = resolveClient(client, logger);

  try {
    await resolvedClient.deleteTeam({ syned_team_id: remoteTeamId });
    logger?.info?.(`Successfully deleted team ${teamId} from Game Platform`);
  } catch (error: any) {
    logger?.error?.('Failed to delete team from Game Platform', { teamId, error });
    throw error;
  }

  await supabase
    .from('teams')
    .update({
      game_platform_id: null,
      game_platform_synced_at: new Date().toISOString(),
      game_platform_sync_error: null,
    })
    .eq('id', teamId);

  await updateGamePlatformTeam(supabase, teamId, {
    syncedTeamId: null,
    metactfTeamId: null,
    status: 'pending',
    syncError: null,
    lastSyncedAt: new Date().toISOString(),
  });

  return {
    status: 'deleted',
    team,
  };
}

function buildPreferredUsername(competitor: any): string {
  if (competitor.preferred_username) return competitor.preferred_username;

  // Prioritize constructing from first.last name (matches fixture behavior)
  if (competitor.first_name && competitor.last_name) {
    const nameBased = `${competitor.first_name}.${competitor.last_name}`
      .toLowerCase()
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .slice(0, 32);
    if (nameBased.length >= 3) return nameBased;
  }

  // Fallback to email prefix (for cases where names are missing/invalid)
  const source = competitor.email_personal || competitor.email_school;
  if (source) {
    const cleaned = String(source)
      .split('@')[0]
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .slice(0, 32);
    if (cleaned.length >= 3) return cleaned;
  }

  // Final fallback
  const fallback = `competitor-${String(competitor.id || Date.now()).replace(/[^a-zA-Z0-9]/g, '')}`;
  return fallback.slice(0, 32);
}

async function updateCompetitorSyncError(supabase: AnySupabaseClient, competitorId: string, message: string | null) {
  const timestamp = message ? null : new Date().toISOString();

  await supabase
    .from('competitors')
    .update({
      game_platform_sync_error: message,
      ...(timestamp ? { game_platform_synced_at: timestamp } : {}),
    })
    .eq('id', competitorId);

  const status: GamePlatformSyncStatus = message ? 'error' : 'approved';
  const profile = await updateGamePlatformProfile(
    supabase,
    { competitorId },
    {
      status,
      syncError: message,
      lastSyncedAt: timestamp,
    },
  );

  if (!profile) {
    await upsertGamePlatformProfile(supabase, {
      competitorId,
      metactfRole: 'user',
      syncedUserId: null,
      status,
      syncError: message,
      lastSyncedAt: timestamp,
    });
  }
}

async function persistCompetitorSyncSuccess(
  supabase: AnySupabaseClient,
  competitorId: string,
  competitor: any,
  remoteUserId: string,
  remoteStatus?: GamePlatformSyncStatus,
) {
  const nextStatus = calculateCompetitorStatus({ ...competitor, game_platform_id: remoteUserId });
  const syncedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('competitors')
    .update({
      game_platform_id: remoteUserId,
      game_platform_synced_at: syncedAt,
      game_platform_sync_error: null,
      game_platform_onboarding_email: competitor.email_personal || competitor.email_school,
      status: nextStatus,
    })
    .eq('id', competitorId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to persist competitor Game Platform state: ${error.message}`);
  }

  const profile = await updateGamePlatformProfile(
    supabase,
    { competitorId },
    {
      status: remoteStatus ?? 'approved',
      syncError: null,
      lastSyncedAt: syncedAt,
      syncedUserId: remoteUserId,
    },
  );

  if (!profile) {
    await upsertGamePlatformProfile(supabase, {
      competitorId,
      metactfRole: 'user',
      syncedUserId: remoteUserId,
      status: remoteStatus ?? 'approved',
      syncError: null,
      lastSyncedAt: syncedAt,
    });
  }

  return data;
}

async function persistTeamSyncSuccess(
  supabase: AnySupabaseClient,
  teamId: string,
  team: any,
  remoteTeamId: string,
  coachMetaId?: string | null,
  remoteMeta?: {
    syncedTeamId?: string | null;
    metactfTeamId?: number | null;
    metactfTeamName?: string | null;
    status?: GamePlatformSyncStatus;
  },
) {
  const syncedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from('teams')
    .update({
      game_platform_id: remoteTeamId,
      game_platform_synced_at: syncedAt,
      game_platform_sync_error: null,
      ...(coachMetaId ? { syned_coach_user_id: coachMetaId } : {}),
    })
    .eq('id', teamId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to persist team Game Platform state: ${error.message}`);
  }

  await upsertGamePlatformTeam(supabase, {
    teamId,
    syncedTeamId: remoteMeta?.syncedTeamId ?? remoteTeamId,
    metactfTeamId: remoteMeta?.metactfTeamId ?? null,
    metactfTeamName: remoteMeta?.metactfTeamName ?? team.name,
    status: remoteMeta?.status ?? 'approved',
    syncError: null,
    lastSyncedAt: syncedAt,
  });

  return data ?? { ...team, game_platform_id: remoteTeamId };
}

async function updateTeamSyncError(supabase: AnySupabaseClient, teamId: string, message: string | null) {
  const timestamp = message ? null : new Date().toISOString();

  await supabase
    .from('teams')
    .update({
      game_platform_sync_error: message,
      ...(timestamp ? { game_platform_synced_at: timestamp } : {}),
    })
    .eq('id', teamId);

  await updateGamePlatformTeam(supabase, teamId, {
    status: message ? 'error' : 'approved',
    syncError: message,
    lastSyncedAt: timestamp,
  });
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
  globalAfterTimeUnix,
  skipFlashCtfSync,
  ctfOnly,
  forceFlashCtfSync,
}: SyncCompetitorStatsParams): Promise<SyncCompetitorStatsResult> {
  const { data: competitor, error } = await supabase
    .from('competitors')
    .select('id, first_name, last_name, coach_id, game_platform_id, game_platform_sync_error, team_members:team_members(team_id, teams!inner(game_platform_id))')
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

  const syncedUserId = competitor.game_platform_id;
  const effectiveDryRun = isDryRunOverride(dryRun);
  const shouldClearSyncErrors = Boolean(competitor.game_platform_sync_error);

  if (effectiveDryRun) {
    return {
      competitorId,
      status: 'dry-run',
    };
  }

  const resolvedClient = resolveClient(client, logger);

  const statsClient: AnySupabaseClient = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : supabase;

  // Use global sync timestamp if provided, otherwise fall back to per-user timestamp
  let afterTimeUnix: number | null = null;
  let existingSyncState: {
    last_odl_synced_at: string | null;
    last_remote_accessed_at: string | null;
    last_login_at?: string | null;
  } | null = null;

  if (globalAfterTimeUnix !== undefined) {
    // Global timestamp provided by batch sync
    afterTimeUnix = globalAfterTimeUnix;
    if (ctfOnly) {
      const { data: syncState } = await supabase
        .from('game_platform_sync_state')
        .select('last_odl_synced_at, last_remote_accessed_at, last_login_at')
        .eq('synced_user_id', syncedUserId)
        .maybeSingle();
      existingSyncState = syncState ?? null;
    }
  } else {
    // Fall back to per-user timestamp (for standalone competitor syncs)
    const { data: syncState } = await supabase
      .from('game_platform_sync_state')
      .select('last_odl_synced_at, last_remote_accessed_at, last_login_at')
      .eq('synced_user_id', syncedUserId)
      .maybeSingle();

    existingSyncState = syncState ?? null;
    if (!ctfOnly) {
      const lastOdlSyncedAt = syncState?.last_odl_synced_at;
      afterTimeUnix = lastOdlSyncedAt ? Math.floor(new Date(lastOdlSyncedAt).getTime() / 1000) : null;
    }
  }

  const profileMapping = await getGamePlatformProfile(supabase, { competitorId }).catch(() => null);
  let lastLoginAt: string | null = existingSyncState?.last_login_at ?? null;
  let userSnapshot: any = null;
  const shouldFetchLastLogin = !lastLoginAt || profileMapping?.status === 'user_created';

  if (shouldFetchLastLogin) {
    try {
      userSnapshot = await resolvedClient.getUser({ syned_user_id: syncedUserId });
      const lastLoginUnix = (userSnapshot as any)?.last_login_unix_timestamp;
      if (typeof lastLoginUnix === 'number') {
        lastLoginAt = new Date(lastLoginUnix * 1000).toISOString();
      }
    } catch (err: any) {
      logger?.warn?.('Failed to fetch MetaCTF user for last_login', { error: err });
    }
  }

  if (lastLoginAt && profileMapping?.status === 'user_created') {
    try {
      await updateGamePlatformProfile(
        supabase,
        { competitorId },
        { status: 'approved', syncError: null },
      );
    } catch (err: any) {
      logger?.warn?.('Failed to promote MetaCTF status after login', { error: err });
    }
  }

  if (!ctfOnly) {
    logger?.info?.(
      afterTimeUnix
        ? `Incremental ODL sync for ${syncedUserId} after ${new Date(afterTimeUnix * 1000).toISOString()}`
        : `Full ODL sync for ${syncedUserId} (first sync)`
    );
  } else {
    logger?.info?.(`CTF-only sync for ${syncedUserId} (skipping ODL)`);
  }

  let scores: any = null;
  let scoresError: unknown = null;
  let blockedStatus: 'missing_user' | 'not_approved' | null = null;
  let blockedMessage: string | null = null;

  if (!ctfOnly) {
    try {
      scores = await resolvedClient.getScores({
        syned_user_id: syncedUserId,
        after_time_unix: afterTimeUnix,
      });
    } catch (err: any) {
      if (err?.status === 404) {
        blockedStatus = 'missing_user';
        blockedMessage = typeof err?.message === 'string'
          ? err.message
          : `ODL scores unavailable for ${syncedUserId}`;
        logger?.info?.(`ODL scores missing for ${syncedUserId}`);
      } else if (err?.status === 403) {
        blockedStatus = 'not_approved';
        blockedMessage = typeof err?.message === 'string'
          ? err.message
          : `ODL scores forbidden for ${syncedUserId}`;
        logger?.info?.(`ODL scores forbidden for ${syncedUserId}`);
      } else {
        scoresError = err;
        logger?.warn?.(`Failed to fetch ODL scores for ${syncedUserId}`, { error: err });
      }
    }

    if (blockedStatus) {
      let message = blockedMessage ?? `ODL scores unavailable for ${syncedUserId}`;

    if (blockedStatus === 'not_approved') {
      try {
        const user = userSnapshot ?? await resolvedClient.getUser({ syned_user_id: syncedUserId });
        const rawStatus = (user as any)?.metactf_user_status;
        if (typeof rawStatus === 'string' && rawStatus.length) {
          message = `${message} (metactf_user_status: ${rawStatus})`;
          await updateGamePlatformProfile(
              supabase,
              { competitorId },
              {
                status: normalizeSyncStatus(rawStatus),
                syncError: message,
                lastSyncedAt: new Date().toISOString(),
                syncedUserId,
              },
            );
          }
        } catch (lookupError: any) {
          logger?.warn?.(`Failed to fetch MetaCTF user status for ${syncedUserId}`, { error: lookupError });
        }
      }

      await updateCompetitorSyncError(supabase, competitorId, message);

    const { error: syncStateMissingError } = await statsClient
      .from('game_platform_sync_state')
      .upsert({
        synced_user_id: syncedUserId,
        last_attempt_at: new Date().toISOString(),
        last_result: 'failure',
        error_message: message.slice(0, 500),
        last_login_at: lastLoginAt ?? existingSyncState?.last_login_at ?? null,
      });

      if (syncStateMissingError) {
        throw new Error(`Failed to persist sync failure state: ${syncStateMissingError.message}`);
      }

      return {
        competitorId,
        status: blockedStatus === 'missing_user' ? 'skipped_remote_missing' : 'error',
        message,
      };
    }

    if (scoresError) {
      const message = scoresError instanceof Error
        ? scoresError.message
        : 'Failed to fetch ODL scores';

    const syncStateFailurePayload = {
      synced_user_id: syncedUserId,
      last_attempt_at: new Date().toISOString(),
      last_result: 'failure' as const,
      error_message: message.slice(0, 500),
      last_login_at: lastLoginAt ?? existingSyncState?.last_login_at ?? null,
    };

      const { error: syncStateFailureError } = await statsClient
        .from('game_platform_sync_state')
        .upsert(syncStateFailurePayload);

      if (syncStateFailureError) {
        throw new Error(`Failed to persist sync failure state: ${syncStateFailureError.message}`);
      }

      const status = (scoresError as any)?.status;
      if (typeof status === 'number' && status < 500) {
        await updateCompetitorSyncError(supabase, competitorId, message);
      }

      return {
        competitorId,
        status: 'error',
        message,
      };
    }
  }

  let flash: any = null;

  // Only fetch Flash CTF data if sentinel detected new events (or if we're forcing a full sync)
  if (!skipFlashCtfSync) {
    try {
      flash = await resolvedClient.getFlashCtfProgress({ syned_user_id: syncedUserId });
    } catch (err: any) {
      if (err?.status === 404) {
        logger?.info?.(`No Flash CTF progress for ${syncedUserId}`);
      } else {
        logger?.warn?.(`Failed to fetch Flash CTF progress for ${syncedUserId}`, { error: err });
      }
    }
  }

  if (forceFlashCtfSync && flash && !ctfOnly) {
    logger?.info?.(`Force refreshing Flash CTF data for ${syncedUserId}`);
  }

  if (forceFlashCtfSync && flash) {
    await statsClient
      .from('game_platform_challenge_solves')
      .delete()
      .eq('synced_user_id', syncedUserId)
      .eq('source', 'flash_ctf');

    await statsClient
      .from('game_platform_flash_ctf_events')
      .delete()
      .eq('synced_user_id', syncedUserId);
  }

  const normalizedScores = Array.isArray(scores) ? scores[0] : scores;
  const odlSolves = Array.isArray(normalizedScores?.challenge_solves)
    ? normalizedScores.challenge_solves
    : [];

  const hasNewOdlSolves = !ctfOnly && odlSolves.length > 0;

  // Skip calculating totals here - handled by separate sweep job
  const lastActivityUnix = normalizedScores?.last_accessed_unix_timestamp ?? null;
  const lastActivity = lastActivityUnix ? new Date(lastActivityUnix * 1000).toISOString() : null;
  const flashEntries: any[] = flash?.flash_ctfs ?? [];

  const syncedTeamId = Array.isArray((competitor as any).team_members) && (competitor as any).team_members[0]?.teams?.game_platform_id
    ? (competitor as any).team_members[0].teams.game_platform_id
    : null;
  const metactfUserId = normalizedScores?.metactf_user_id
    ?? profileMapping?.metactf_user_id
    ?? null;

  const flashSolveRows: any[] = [];
  const flashEventRows: any[] = [];

  let latestFlashStart: string | null = null;

  for (const entry of flashEntries) {
    const start = entry?.flash_ctf_time_start_unix ? new Date(entry.flash_ctf_time_start_unix * 1000).toISOString() : null;
    const end = entry?.flash_ctf_time_end_unix ? new Date(entry.flash_ctf_time_end_unix * 1000).toISOString() : null;
    const eventId = entry?.event_id ?? `${entry?.flash_ctf_name ?? 'flash_ctf'}:${entry?.flash_ctf_time_start_unix ?? Date.now()}`;

    flashEventRows.push({
      synced_user_id: syncedUserId,
      metactf_user_id: metactfUserId,
      event_id: eventId,
      flash_ctf_name: entry?.flash_ctf_name ?? null,
      challenges_solved: entry?.challenges_solved ?? 0,
      points_earned: entry?.points_earned ?? null,
      rank: entry?.rank ?? null,
      max_points_possible: entry?.max_points_possible ?? null,
      started_at: start,
      ended_at: end,
      raw_payload: entry,
    });

    if (start && (!latestFlashStart || start > latestFlashStart)) {
      latestFlashStart = start;
    }

    if (Array.isArray(entry?.challenge_solves)) {
      for (const solve of entry.challenge_solves) {
        const solveId = solve?.challenge_solve_id;
        if (!solveId) continue;
        flashSolveRows.push({
          synced_user_id: syncedUserId,
          metactf_user_id: metactfUserId,
          synced_team_id: syncedTeamId,
          challenge_solve_id: solveId,
          challenge_id: solve?.challenge_id ?? null,
          challenge_title: solve?.challenge_title ?? null,
          challenge_category: normalizeChallengeCategoryLabel(solve?.challenge_category) ?? null,
          challenge_points: solve?.challenge_points ?? null,
          solved_at: solve?.timestamp_unix ? new Date(solve.timestamp_unix * 1000).toISOString() : null,
          source: 'flash_ctf',
          raw_payload: solve,
        });
      }
    }
  }

  const odlSolveRows = odlSolves
    .map((solve: any) => {
      const solveId = solve?.challenge_solve_id;
      if (!solveId) return null;
      return {
        synced_user_id: syncedUserId,
        metactf_user_id: metactfUserId,
        synced_team_id: syncedTeamId,
        challenge_solve_id: solveId,
        challenge_id: solve?.challenge_id ?? null,
        challenge_title: solve?.challenge_title ?? null,
        challenge_category: normalizeChallengeCategoryLabel(solve?.challenge_category) ?? null,
        challenge_points: solve?.challenge_points ?? null,
        solved_at: solve?.timestamp_unix ? new Date(solve.timestamp_unix * 1000).toISOString() : null,
        source: 'odl',
        raw_payload: solve,
      };
    })
    .filter(Boolean) as any[];

  if (!ctfOnly && odlSolveRows.length) {
    const { error: upsertOdlError } = await statsClient
      .from('game_platform_challenge_solves')
      .upsert(odlSolveRows, { onConflict: 'synced_user_id,challenge_solve_id' });
    if (upsertOdlError) {
      throw new Error(`Failed to upsert ODL challenge solves: ${upsertOdlError.message}`);
    }
  }

  if (flashSolveRows.length) {
    const { error: upsertFlashSolveError } = await statsClient
      .from('game_platform_challenge_solves')
      .upsert(flashSolveRows, { onConflict: 'synced_user_id,challenge_solve_id' });
    if (upsertFlashSolveError) {
      throw new Error(`Failed to upsert Flash CTF challenge solves: ${upsertFlashSolveError.message}`);
    }
  }

  if (flashEventRows.length) {
    const { error: upsertFlashEventError } = await statsClient
      .from('game_platform_flash_ctf_events')
      .upsert(flashEventRows, { onConflict: 'synced_user_id,event_id' });
    if (upsertFlashEventError) {
      throw new Error(`Failed to upsert Flash CTF events: ${upsertFlashEventError.message}`);
    }
  }

  // Determine if competitor needs totals refresh
  const needsRefresh = hasNewOdlSolves || flashEntries.length > 0;

  // Check if stats row exists - if not, we need to create it even if there's no activity
  const { data: existingStats } = await statsClient
    .from('game_platform_stats')
    .select('id, last_activity')
    .eq('competitor_id', competitorId)
    .maybeSingle();

  const needsStatsRowCreation = !existingStats;

  // Even if there's no new data, update last_activity if it has changed
  if (existingStats && lastActivity) {
    const currentLastActivity = existingStats.last_activity;
    const hasActivityChanged = !currentLastActivity || currentLastActivity !== lastActivity;

    if (hasActivityChanged) {
      await statsClient
        .from('game_platform_stats')
        .update({ last_activity: lastActivity, updated_at: new Date().toISOString() })
        .eq('id', existingStats.id);
    }
  }

  const syncStatePayload = {
    synced_user_id: syncedUserId,
    last_odl_synced_at: ctfOnly
      ? existingSyncState?.last_odl_synced_at ?? null
      : new Date().toISOString(),
    last_flash_ctf_synced_at: latestFlashStart,
    last_remote_accessed_at: ctfOnly
      ? existingSyncState?.last_remote_accessed_at ?? null
      : lastActivity,
    last_attempt_at: new Date().toISOString(),
    last_result: 'success' as const,
    error_message: null as string | null,
    last_login_at: lastLoginAt ?? existingSyncState?.last_login_at ?? null,
    // Set refresh flag to true if new activity detected OR if stats row doesn't exist, otherwise false
    needs_totals_refresh: needsRefresh || needsStatsRowCreation,
  };

  const { error: upsertSyncStateError } = await statsClient
    .from('game_platform_sync_state')
    .upsert(syncStatePayload);
  if (upsertSyncStateError) {
    throw new Error(`Failed to update sync state: ${upsertSyncStateError.message}`);
  }

  if (shouldClearSyncErrors) {
    await updateCompetitorSyncError(supabase, competitorId, null);
  }

  if (needsRefresh) {
    logger?.info?.(`Marked ${syncedUserId} for totals refresh (${odlSolves.length} new ODL, ${flashEntries.length} flash events)`);
  } else if (needsStatsRowCreation) {
    logger?.info?.(`Marked ${syncedUserId} for totals refresh (stats row doesn't exist)`);
  }

  const syncTimestamp = new Date().toISOString();

  const { error: competitorSyncMetaError } = await supabase
    .from('competitors')
    .update({
      game_platform_synced_at: syncTimestamp,
      game_platform_sync_error: null,
    })
    .eq('id', competitorId);

  if (competitorSyncMetaError) {
    logger?.warn?.('Failed to update competitor sync timestamp', {
      competitorId,
      error: competitorSyncMetaError.message,
    });
  }

  try {
    const updatedProfile = await updateGamePlatformProfile(
      supabase,
      { competitorId },
      {
        status: 'approved',
        syncError: null,
        lastSyncedAt: syncTimestamp,
        syncedUserId,
      },
    );

    if (!updatedProfile) {
      await upsertGamePlatformProfile(supabase, {
        competitorId,
        metactfRole: 'user',
        syncedUserId,
        status: 'approved',
        syncError: null,
        lastSyncedAt: syncTimestamp,
      });
    }
  } catch (profileError) {
    logger?.warn?.('Failed to update competitor game platform profile after stats sync', {
      competitorId,
      error: profileError instanceof Error ? profileError.message : String(profileError),
    });
  }

  // Return 'synced' only if we actually found new data, otherwise 'skipped_no_new_data'
  // Note: We only check ODL solves here because the API filters by after_time_unix.
  // Flash CTF data is not filtered by the API, so we sync it opportunistically when processing ODL updates.
  const hasNewData = hasNewOdlSolves;

  return {
    competitorId,
    status: hasNewData ? 'synced' : 'skipped_no_new_data',
  };
}

export interface RefreshCompetitorTotalsParams extends ServiceOptions {
  competitorId: string;
  syncedUserId: string;
}

export async function refreshCompetitorTotals({
  supabase,
  client,
  competitorId,
  syncedUserId,
  dryRun,
  logger,
}: RefreshCompetitorTotalsParams): Promise<void> {
  const effectiveDryRun = isDryRunOverride(dryRun);

  if (effectiveDryRun) {
    logger?.info?.(`[DRY RUN] Would refresh totals for ${syncedUserId}`);
    return;
  }

  const statsClient: AnySupabaseClient = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : supabase;

  const { data: solveRows, error: solveError } = await statsClient
    .from('game_platform_challenge_solves')
    .select('challenge_points, solved_at')
    .eq('synced_user_id', syncedUserId);

  if (solveError) {
    throw new Error(`Failed to load challenge solves for totals refresh: ${solveError.message}`);
  }

  const totalChallenges = solveRows?.length ?? 0;
  const totalPoints = (solveRows || []).reduce((sum, row) => sum + (row.challenge_points ?? 0), 0);
  const lastSolveAt = (solveRows || []).reduce<string | null>((latest, row) => {
    if (!row.solved_at) return latest;
    if (!latest || row.solved_at > latest) return row.solved_at;
    return latest;
  }, null);

  const { data: flashRows, error: flashError } = await statsClient
    .from('game_platform_flash_ctf_events')
    .select('challenges_solved, started_at')
    .eq('synced_user_id', syncedUserId);

  if (flashError) {
    throw new Error(`Failed to load Flash CTF events for totals refresh: ${flashError.message}`);
  }

  const monthlyCtfChallenges = (flashRows || []).reduce(
    (sum, row) => sum + (row.challenges_solved ?? 0),
    0,
  );
  const lastFlashAt = (flashRows || []).reduce<string | null>((latest, row) => {
    if (!row.started_at) return latest;
    if (!latest || row.started_at > latest) return row.started_at;
    return latest;
  }, null);

  // Update totals in game_platform_stats
  const existing = await getOrCreateStatsRow(statsClient, competitorId);

  const lastActivity = lastSolveAt && lastFlashAt
    ? (lastSolveAt > lastFlashAt ? lastSolveAt : lastFlashAt)
    : (lastSolveAt ?? lastFlashAt ?? null);

  const totalsPayload: any = {
    challenges_completed: totalChallenges,
    monthly_ctf_challenges: monthlyCtfChallenges,
    total_score: totalPoints,
    last_activity: lastActivity,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error: updateError } = await statsClient
      .from('game_platform_stats')
      .update(totalsPayload)
      .eq('id', existing.id);
    if (updateError) {
      throw new Error(`Failed to update totals: ${updateError.message}`);
    }
  } else {
    const { error: insertError } = await statsClient
      .from('game_platform_stats')
      .insert({
        competitor_id: competitorId,
        ...totalsPayload,
      });
    if (insertError) {
      throw new Error(`Failed to insert totals: ${insertError.message}`);
    }
  }

  // Clear the refresh flag on success
  const { error: clearFlagError } = await statsClient
    .from('game_platform_sync_state')
    .update({ needs_totals_refresh: false })
    .eq('synced_user_id', syncedUserId);

  if (clearFlagError) {
    logger?.warn?.(`Failed to clear totals refresh flag for ${syncedUserId}`, { error: clearFlagError });
  }

  logger?.info?.(`Refreshed totals for ${syncedUserId} from local solves: ${totalChallenges} challenges, ${totalPoints} points`);
}

export interface SweepPendingTotalsRefreshParams extends ServiceOptions {
  coachId?: string | null;
  batchSize?: number;
  forceAll?: boolean;
  cursor?: { id: string } | null;
}

export async function sweepPendingTotalsRefresh({
  supabase,
  client,
  dryRun,
  logger,
  coachId,
  batchSize = 100,
  forceAll = false,
  cursor = null,
}: SweepPendingTotalsRefreshParams) {
  const effectiveDryRun = isDryRunOverride(dryRun);
  const statsClient: AnySupabaseClient = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : supabase;

  if (forceAll) {
    let competitorQuery = supabase
      .from('competitors')
      .select('id, game_platform_id')
      .not('game_platform_id', 'is', null)
      .order('id', { ascending: true })
      .limit(batchSize);

    if (coachId) {
      competitorQuery = competitorQuery.eq('coach_id', coachId);
    }

    if (cursor?.id) {
      competitorQuery = competitorQuery.gt('id', cursor.id);
    }

    const { data: competitors, error: competitorError } = await competitorQuery;
    if (competitorError) {
      throw new Error(`Failed to load competitors for force totals sweep: ${competitorError.message}`);
    }

    if (!competitors || competitors.length === 0) {
      logger?.info?.('No competitors found for force totals sweep');
      return {
        total: 0,
        refreshed: 0,
        failed: 0,
        results: [],
        nextCursor: null as { id: string } | null,
      };
    }

    const results: Array<{ syncedUserId: string; status: 'success' | 'failed'; error?: string }> = [];
    let refreshed = 0;
    let failed = 0;

    for (const competitor of competitors) {
      if (!competitor.game_platform_id) continue;
      try {
        await refreshCompetitorTotals({
          supabase,
          client,
          competitorId: competitor.id,
          syncedUserId: competitor.game_platform_id,
          dryRun: effectiveDryRun,
          logger,
        });
        results.push({ syncedUserId: competitor.game_platform_id, status: 'success' });
        refreshed++;
      } catch (err: any) {
        logger?.error?.(`Failed to refresh totals for ${competitor.game_platform_id}`, { error: err });
        results.push({
          syncedUserId: competitor.game_platform_id,
          status: 'failed',
          error: err?.message ?? 'Unknown error',
        });
        failed++;
      }
    }

    const last = competitors[competitors.length - 1];
    const nextCursor = competitors.length >= batchSize && last?.id ? { id: last.id as string } : null;

    return {
      total: competitors.length,
      refreshed,
      failed,
      results,
      nextCursor,
    };
  }

  // Find all competitors needing totals refresh
  let pendingQuery = statsClient
    .from('game_platform_sync_state')
    .select('synced_user_id')
    .eq('needs_totals_refresh', true)
    .limit(batchSize);

  const { data: pendingStates, error: queryError } = await pendingQuery;

  if (queryError) {
    throw new Error(`Failed to query pending totals refresh: ${queryError.message}`);
  }

  const pendingUserIds = (pendingStates || []).map(s => s.synced_user_id);

  if (pendingUserIds.length === 0) {
    logger?.info?.('No competitors need totals refresh');
    return {
      total: 0,
      refreshed: 0,
      failed: 0,
      results: [],
      nextCursor: null as { id: string } | null,
    };
  }

  logger?.info?.(`Found ${pendingUserIds.length} competitors needing totals refresh`);

  // Map synced_user_id back to competitor_id
  let competitorQuery = supabase
    .from('competitors')
    .select('id, game_platform_id')
    .in('game_platform_id', pendingUserIds);

  if (coachId) {
    competitorQuery = competitorQuery.eq('coach_id', coachId);
  }

  const { data: competitors, error: competitorError } = await competitorQuery;

  if (competitorError) {
    throw new Error(`Failed to load competitors for refresh: ${competitorError.message}`);
  }

  const results: Array<{ syncedUserId: string; status: 'success' | 'failed'; error?: string }> = [];
  let refreshed = 0;
  let failed = 0;

  for (const competitor of competitors || []) {
    if (!competitor.game_platform_id) continue;

    try {
      await refreshCompetitorTotals({
        supabase,
        client,
        competitorId: competitor.id,
        syncedUserId: competitor.game_platform_id,
        dryRun: effectiveDryRun,
        logger,
      });
      results.push({ syncedUserId: competitor.game_platform_id, status: 'success' });
      refreshed++;
    } catch (err: any) {
      logger?.error?.(`Failed to refresh totals for ${competitor.game_platform_id}`, { error: err });
      results.push({
        syncedUserId: competitor.game_platform_id,
        status: 'failed',
        error: err?.message ?? 'Unknown error',
      });
      failed++;
      // Continue processing other competitors even if one fails
    }
  }

  return {
    total: pendingUserIds.length,
    refreshed,
    failed,
    results,
    nextCursor: null as { id: string } | null,
  };
}

type SyncWaveCursor = { createdAt: string; id: string };

const DEFAULT_SYNC_WAVE_BATCH_SIZE = 50;
const MAX_SYNC_WAVE_BATCH_SIZE = 200;

function clampSyncWaveBatchSize(value?: number) {
  if (!value || Number.isNaN(value)) return DEFAULT_SYNC_WAVE_BATCH_SIZE;
  return Math.max(1, Math.min(MAX_SYNC_WAVE_BATCH_SIZE, Math.floor(value)));
}

function parseSyncWaveCursor(raw: unknown): SyncWaveCursor | null {
  if (!raw || typeof raw !== 'object') return null;
  const createdAt = (raw as any).createdAt;
  const id = (raw as any).id;
  if (typeof createdAt !== 'string' || typeof id !== 'string') return null;
  if (!createdAt || !id) return null;
  return { createdAt, id };
}

async function fetchCompetitorBatch(params: {
  supabase: AnySupabaseClient;
  coachId?: string | null;
  cursor: SyncWaveCursor | null;
  batchSize: number;
}) {
  const { supabase, coachId, cursor, batchSize } = params;

  let query = supabase
    .from('competitors')
    .select('id, coach_id, game_platform_id, created_at')
    .not('game_platform_id', 'is', null)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(batchSize);

  if (coachId) {
    query = query.eq('coach_id', coachId);
  }

  if (cursor) {
    query = query.or(
      `created_at.gt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.gt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list competitors for stats sync batch: ${error.message}`);
  }

  let rows = (data ?? []) as Array<any>;
  let wrapped = false;

  if (rows.length === 0 && cursor) {
    wrapped = true;
    let resetQuery = supabase
      .from('competitors')
      .select('id, coach_id, game_platform_id, created_at')
      .not('game_platform_id', 'is', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(batchSize);

    if (coachId) {
      resetQuery = resetQuery.eq('coach_id', coachId);
    }

    const { data: resetData, error: resetError } = await resetQuery;
    if (resetError) {
      throw new Error(`Failed to list competitors for stats sync batch (reset): ${resetError.message}`);
    }
    rows = (resetData ?? []) as Array<any>;
  }

  const last = rows.length > 0 ? rows[rows.length - 1] : null;
  const nextCursor = last
    ? { createdAt: String(last.created_at), id: String(last.id) }
    : (wrapped ? null : cursor);

  return { rows, nextCursor, wrapped };
}

export async function syncAllCompetitorGameStats({
  supabase,
  client,
  dryRun,
  logger,
  coachId,
  forceFullSync,
  forceFlashCtfSync,
  batchSize,
  cursor,
  wave,
}: SyncAllCompetitorStatsParams): Promise<SyncAllCompetitorStatsSummary> {
  const statsClient: AnySupabaseClient = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : supabase;

  const useWave = wave === true || typeof batchSize === 'number';
  const resolvedBatchSize = useWave ? clampSyncWaveBatchSize(batchSize) : null;
  const parsedCursor = useWave ? parseSyncWaveCursor(cursor ?? null) : null;

  // Create a sync run record to track this batch
  const { data: syncRun, error: syncRunError } = await statsClient
    .from('game_platform_sync_runs')
    .insert({
      status: 'running',
      sync_type: useWave ? 'wave' : 'incremental',
    })
    .select()
    .single();

  if (syncRunError || !syncRun) {
    throw new Error(`Failed to create sync run: ${syncRunError?.message}`);
  }

  const syncRunId = syncRun.id;

  // Get the last successful sync timestamp to use as after_time_unix for all competitors
  let globalAfterTime: number | null | undefined = undefined;

  if (forceFullSync) {
    globalAfterTime = null;
    logger?.info?.('forceFullSync enabled - performing full sync for all competitors (ignoring last sync timestamp)');
  } else if (!useWave) {
    const { data: lastSync } = await statsClient
      .from('game_platform_sync_runs')
      .select('completed_at')
      .eq('status', 'completed')
      .neq('sync_type', 'wave')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    globalAfterTime = lastSync?.completed_at
      ? Math.floor(new Date(lastSync.completed_at).getTime() / 1000)
      : null;

    if (globalAfterTime) {
      logger?.info?.(`Using global sync timestamp: ${new Date(globalAfterTime * 1000).toISOString()}`);
    } else {
      logger?.info?.('No previous sync found - performing full sync for all competitors');
    }
  } else {
    logger?.info?.('Wave sync enabled - using per-competitor sync timestamps');
  }

  let competitors: Array<any> = [];
  let nextCursor: SyncWaveCursor | null = null;
  let wrapped = false;

  if (useWave && resolvedBatchSize) {
    const batch = await fetchCompetitorBatch({
      supabase,
      coachId,
      cursor: parsedCursor,
      batchSize: resolvedBatchSize,
    });
    competitors = batch.rows;
    nextCursor = batch.nextCursor;
    wrapped = batch.wrapped;
  } else {
    let competitorQuery = supabase
      .from('competitors')
      .select('id, coach_id, game_platform_id')
      .not('game_platform_id', 'is', null);

    if (coachId) {
      competitorQuery = competitorQuery.eq('coach_id', coachId);
    }

    const { data, error } = await competitorQuery;

    if (error) {
      // Mark sync run as failed
      await statsClient
        .from('game_platform_sync_runs')
        .update({ status: 'failed', error_message: error.message })
        .eq('id', syncRunId);
      throw new Error(`Failed to list competitors for stats sync: ${error.message}`);
    }

    competitors = data ?? [];
  }

  // Sentinel user detection for Flash CTF events
  // Flash CTF events are monthly and global - if one user has a new event, all users can participate
  // We check a "sentinel" user to detect new events before syncing all users
  let hasNewFlashCtfEvent = false;
  const resolvedClient = resolveClient(client, logger);

  if (!forceFlashCtfSync && competitors && competitors.length > 0) {
    const sentinelUser = competitors[0]; // Use first competitor as sentinel

    try {
      logger?.info?.(`Checking sentinel user ${sentinelUser.game_platform_id} for new Flash CTF events`);

      const sentinelFlash = await resolvedClient.getFlashCtfProgress({
        syned_user_id: sentinelUser.game_platform_id!,
      });

      // Per MetaCTF API spec, event_id doesn't exist - use flash_ctf_name for identification
      const sentinelEventNames = (sentinelFlash?.flash_ctfs || [])
        .map((e: any) => e.flash_ctf_name)
        .filter(Boolean);

      if (sentinelEventNames.length > 0) {
        // Check which events we already know about by name
        const { data: knownEvents } = await statsClient
          .from('game_platform_flash_ctf_events')
          .select('flash_ctf_name')
          .in('flash_ctf_name', sentinelEventNames);

        const knownEventNames = new Set((knownEvents || []).map((e: any) => e.flash_ctf_name));
        const newEventNames = sentinelEventNames.filter((name: string) => !knownEventNames.has(name));

        if (newEventNames.length > 0) {
          hasNewFlashCtfEvent = true;
          logger?.info?.(`✨ New Flash CTF event(s) detected: ${newEventNames.join(', ')}`);
        } else {
          logger?.info?.(`No new Flash CTF events (checked ${sentinelEventNames.length} known events)`);
        }
      } else {
        logger?.info?.('Sentinel user has no Flash CTF events');
      }
    } catch (err: any) {
      // Don't fail the entire sync if sentinel check fails - just log and continue
      logger?.warn?.(`Failed to check sentinel user for Flash CTF events: ${err.message}`);
    }
  }

  const ctfOnly = Boolean(forceFlashCtfSync && !forceFullSync);

  if (forceFlashCtfSync) {
    hasNewFlashCtfEvent = true;
    logger?.info?.('forceFlashCtfSync enabled - syncing Flash CTF for all competitors');
  }

  const results: SyncCompetitorStatsResult[] = [];

  if (useWave && resolvedBatchSize) {
    logger?.info?.(`Starting wave sync for ${competitors?.length ?? 0} competitors (batch size ${resolvedBatchSize})`);
  } else {
    logger?.info?.(`Starting incremental sync for ${competitors?.length ?? 0} competitors`);
  }

  for (const competitor of competitors || []) {
    const result = await syncCompetitorGameStats({
      supabase,
      client,
      competitorId: competitor.id,
      dryRun,
      logger,
      globalAfterTimeUnix: globalAfterTime,
      ctfOnly,
      forceFlashCtfSync,
      skipFlashCtfSync: !hasNewFlashCtfEvent, // Skip Flash CTF if no new events
    });
    results.push(result);
  }

  const synced = results.filter((r) => r.status === 'synced').length;
  const failed = results.filter((r) => r.status === 'error').length;
  const skipped = results.filter((r) =>
    r.status === 'skipped_no_new_data' ||
    r.status === 'skipped_no_platform_id' ||
    r.status === 'skipped_remote_missing' ||
    r.status === 'dry-run'
  ).length;

  // Mark sync run as completed
  await statsClient
    .from('game_platform_sync_runs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      competitors_synced: synced,
      competitors_failed: failed,
    })
    .eq('id', syncRunId);

  return {
    total: competitors?.length ?? 0,
    synced,
    skipped,
    results,
    nextCursor: useWave ? nextCursor : undefined,
    wrapped: useWave ? wrapped : undefined,
    batchSize: useWave ? resolvedBatchSize : undefined,
  };
}

type SyncAllTeamsParams = {
  supabase: AnySupabaseClient;
  client?: GamePlatformClient;
  dryRun?: boolean | null;
  logger?: { info?: (...args: any[]) => void; warn?: (...args: any[]) => void; error?: (...args: any[]) => void } | Console;
  coachId?: string | null;
};

type SyncTeamSummaryEntry = {
  teamId: string;
  status: SyncTeamResult['status'];
  message?: string | null;
};

export async function syncAllTeamsWithGamePlatform({
  supabase,
  client,
  dryRun,
  logger,
  coachId,
}: SyncAllTeamsParams) {
  const effectiveDryRun = isDryRunOverride(dryRun);

  let teamQuery = supabase
    .from('teams')
    .select('id, coach_id, game_platform_id')
    .not('game_platform_id', 'is', null);

  if (coachId) {
    teamQuery = teamQuery.eq('coach_id', coachId);
  }

  const { data: teams, error } = await teamQuery;

  if (error) {
    throw new Error(`Failed to list teams for roster sync: ${error.message}`);
  }

  const results: SyncTeamSummaryEntry[] = [];

  for (const team of teams || []) {
    try {
      const result = await syncTeamWithGamePlatform({
        supabase,
        client,
        teamId: team.id,
        dryRun: effectiveDryRun,
        logger,
      });

      results.push({
        teamId: team.id,
        status: result.status,
        message: result.status === 'synced' ? null : (result as any)?.message ?? null,
      });
    } catch (err: any) {
      logger?.warn?.('Failed to sync team during roster reconciliation', { teamId: team.id, error: err });
      results.push({
        teamId: team.id,
        status: 'error',
        message: err?.message ?? 'Unknown sync error',
      });
    }
  }

  return {
    total: teams?.length ?? 0,
    synced: results.filter((r) => r.status === 'synced').length,
    skipped: results.filter((r) => r.status !== 'synced').length,
    results,
  };
}

export async function refreshGamePlatformProfiles({
  supabase,
  client,
  dryRun,
  logger,
  coachId,
}: RefreshGamePlatformProfilesParams): Promise<RefreshGamePlatformProfilesSummary> {
  const effectiveDryRun = isDryRunOverride(dryRun);
  const resolvedClient = resolveClient(client, logger);
  const statsClient: AnySupabaseClient = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : supabase;

  let competitorQuery = supabase
    .from('competitors')
    .select('id, coach_id, game_platform_id')
    .order('id', { ascending: true });

  if (coachId) {
    competitorQuery = competitorQuery.eq('coach_id', coachId);
  }

  const { data: competitors, error } = await competitorQuery;
  if (error) {
    throw new Error(`Failed to list competitors for profile refresh: ${error.message}`);
  }

  const competitorIds = (competitors || []).map((c: any) => c.id);
  let profileMappings: Array<{
    competitor_id: string | null;
    synced_user_id: string | null;
    metactf_user_id: number | null;
    metactf_username: string | null;
    status: GamePlatformSyncStatus;
  }> = [];

  if (competitorIds.length) {
    const { data: mappingData, error: mappingError } = await supabase
      .from('game_platform_profiles')
      .select('competitor_id, synced_user_id, metactf_user_id, metactf_username, status')
      .in('competitor_id', competitorIds);
    if (mappingError) {
      throw new Error(`Failed to load game platform profiles: ${mappingError.message}`);
    }
    profileMappings = mappingData || [];
  }

  const mappingByCompetitorId = new Map<string, typeof profileMappings[number]>();
  for (const mapping of profileMappings) {
    if (mapping.competitor_id) {
      mappingByCompetitorId.set(mapping.competitor_id, mapping);
    }
  }

  const syncedUserIds = (competitors || [])
    .map((competitor: any) => {
      const mapping = mappingByCompetitorId.get(competitor.id);
      return competitor.game_platform_id || mapping?.synced_user_id || null;
    })
    .filter((value): value is string => Boolean(value));

  const uniqueSyncedUserIds = Array.from(new Set(syncedUserIds));
  const syncStateByUserId = new Map<string, { last_login_at: string | null }>();
  if (uniqueSyncedUserIds.length) {
    const { data: syncStateData, error: syncStateError } = await statsClient
      .from('game_platform_sync_state')
      .select('synced_user_id, last_login_at')
      .in('synced_user_id', uniqueSyncedUserIds);
    if (syncStateError) {
      throw new Error(`Failed to load sync state for profile refresh: ${syncStateError.message}`);
    }
    for (const state of syncStateData || []) {
      if (state?.synced_user_id) {
        syncStateByUserId.set(state.synced_user_id, { last_login_at: state.last_login_at ?? null });
      }
    }
  }

  const results: RefreshGamePlatformProfilesSummary['results'] = [];
  let refreshed = 0;
  let skipped = 0;
  let failed = 0;

  for (const competitor of competitors || []) {
    const mapping = mappingByCompetitorId.get(competitor.id);
    const syncedUserId = competitor.game_platform_id || mapping?.synced_user_id || null;

    if (!syncedUserId) {
      skipped += 1;
      results.push({
        competitorId: competitor.id,
        syncedUserId: null,
        status: 'skipped_no_platform_id',
      });
      continue;
    }

    if (effectiveDryRun) {
      results.push({
        competitorId: competitor.id,
        syncedUserId,
        status: 'dry-run',
      });
      continue;
    }

    const existingSyncState = syncStateByUserId.get(syncedUserId) ?? null;
    let lastLoginAt: string | null = existingSyncState?.last_login_at ?? null;

    try {
      const user = await resolvedClient.getUser({ syned_user_id: syncedUserId });
      const lastLoginUnix = (user as any)?.last_login_unix_timestamp;
      if (typeof lastLoginUnix === 'number') {
        lastLoginAt = new Date(lastLoginUnix * 1000).toISOString();
      }

      const status = normalizeSyncStatus((user as any)?.metactf_user_status);
      const shouldPromote = Boolean(lastLoginAt && (mapping?.status ?? status) === 'user_created');
      const nextStatus: GamePlatformSyncStatus = shouldPromote ? 'approved' : status;

      await upsertGamePlatformProfile(supabase, {
        competitorId: competitor.id,
        metactfRole: 'user',
        syncedUserId,
        metactfUserId: (user as any)?.metactf_user_id ?? mapping?.metactf_user_id ?? null,
        metactfUsername: (user as any)?.metactf_username ?? mapping?.metactf_username ?? null,
        status: nextStatus,
        syncError: null,
      });

      await statsClient
        .from('game_platform_sync_state')
        .upsert({
          synced_user_id: syncedUserId,
          last_login_at: lastLoginAt ?? existingSyncState?.last_login_at ?? null,
          last_attempt_at: new Date().toISOString(),
          last_result: 'success',
          error_message: null,
        });

      refreshed += 1;
      results.push({
        competitorId: competitor.id,
        syncedUserId,
        status: 'refreshed',
      });
    } catch (err: any) {
      failed += 1;
      const message = err?.message ?? 'Failed to refresh profile';
      logger?.warn?.('Failed to refresh game platform profile', { competitorId: competitor.id, error: err });

      await statsClient
        .from('game_platform_sync_state')
        .upsert({
          synced_user_id: syncedUserId,
          last_login_at: lastLoginAt ?? existingSyncState?.last_login_at ?? null,
          last_attempt_at: new Date().toISOString(),
          last_result: 'failure',
          error_message: message.slice(0, 500),
        });

      results.push({
        competitorId: competitor.id,
        syncedUserId,
        status: 'error',
        message,
      });
    }
  }

  return {
    total: competitors?.length ?? 0,
    refreshed,
    skipped,
    failed,
    results,
  };
}
