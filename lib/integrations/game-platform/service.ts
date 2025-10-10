import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
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
  coachContextId?: string | null;
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
  unassignedMembers?: Array<{ synedUserId: string; remote?: any }>;
}

export interface DeleteTeamParams extends ServiceOptions {
  teamId: string;
}

export interface DeleteTeamResult {
  status: 'deleted' | 'skipped_not_synced' | 'mocked';
  team: any;
}

export interface SyncCompetitorStatsParams extends ServiceOptions {
  competitorId: string;
  globalAfterTimeUnix?: number | null;
  skipFlashCtfSync?: boolean; // Skip Flash CTF API call if no new events detected
}

export interface SyncAllCompetitorStatsParams extends ServiceOptions {
  coachId?: string | null;
  forceFullSync?: boolean;
}

export interface SyncCompetitorStatsResult {
  competitorId: string;
  status: 'synced' | 'skipped_no_platform_id' | 'skipped_remote_missing' | 'skipped_no_new_data' | 'dry-run' | 'error';
  message?: string;
}

const FEATURE_ENABLED = process.env.GAME_PLATFORM_INTEGRATION_ENABLED === 'true';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GAME_PLATFORM_BASE_URL =
  process.env.META_CTF_BASE_URL ?? process.env.GAME_PLATFORM_API_BASE_URL ?? '';
const IS_MOCK_INTEGRATION = /localhost|127\.0\.0\.1/.test(GAME_PLATFORM_BASE_URL);

function resolveClient(client?: GamePlatformClient | GamePlatformClientMock, logger?: Pick<Console, 'error' | 'warn' | 'info'>) {
  if (client) return client;
  try {
    return new GamePlatformClient({ logger });
  } catch (error) {
    throw error;
  }
}

async function ensureCoachGamePlatformId(
  supabase: AnySupabaseClient,
  resolvedClient: GamePlatformClient | GamePlatformClientMock,
  coachProfile: { id: string; email?: string | null; first_name?: string | null; last_name?: string | null; full_name?: string | null; school_name?: string | null; division?: string | null; game_platform_user_id?: string | null },
  logger?: Pick<Console, 'error' | 'warn' | 'info'>
): Promise<string> {
  if (coachProfile.game_platform_user_id) {
    return coachProfile.game_platform_user_id;
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
    // First, try to get the existing coach user from MetaCTF
    let response: any;
    let synedUserId: string;
    let userStatus: string | undefined;

    try {
      logger?.info?.(`🔍 Checking if coach ${coachProfile.id} exists on MetaCTF`);
      response = await (resolvedClient as GamePlatformClient).getUser({ syned_user_id: coachProfile.id });
      synedUserId = response.syned_user_id;
      userStatus = response.metactf_user_status;
      logger?.info?.(`✅ Coach ${coachProfile.id} found on MetaCTF with status: ${userStatus}`, response);
    } catch (getUserError: any) {
      // If coach doesn't exist (404), create them
      if (getUserError?.status === 404) {
        logger?.info?.(`📤 Coach ${coachProfile.id} not found on MetaCTF, creating new coach with payload:`, payload);
        response = await (resolvedClient as GamePlatformClient).createUser(payload);
        synedUserId = response.syned_user_id;
        userStatus = response.metactf_user_status;
        logger?.info?.(`✅ Created coach ${coachProfile.id} on MetaCTF:`, response);
      } else {
        // Other errors should be thrown
        throw getUserError;
      }
    }

    // Check if coach is approved/verified
    // MetaCTF requires coaches to be in "approved" or "user_created" status before they can have competitors
    // Per MetaCTF: "user_created" and "approved" are functionally the same
    if (userStatus && !['approved', 'user_created'].includes(userStatus)) {
      const errorMsg = `Coach user on MetaCTF has status "${userStatus}" and must be "approved" or "user_created" before adding competitors. Please contact MetaCTF support to approve this coach.`;
      logger?.warn?.(errorMsg, { coachId: coachProfile.id, userStatus });
      throw new Error(errorMsg);
    }

    // Update local database with the MetaCTF syned_user_id (UUID) for linking
    // This allows us to skip the API call next time if it's already set
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        game_platform_user_id: synedUserId, // Store the UUID for linking to competitors
        game_platform_last_synced_at: new Date().toISOString(),
      })
      .eq('id', coachProfile.id);

    if (updateError) {
      logger?.warn?.('Failed to persist coach game_platform_user_id', { coachId: coachProfile.id, error: updateError });
    }

    return synedUserId;
  } catch (error) {
    logger?.error?.('Failed to ensure coach Game Platform user', { coachId: coachProfile.id, error });
    throw error;
  }
}

function isDryRunOverride(dryRun?: boolean): boolean {
  // Only check if feature is enabled - ignore dryRun mock parameter
  return !FEATURE_ENABLED;
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

  if (competitor.status !== 'compliance') {
    return { status: 'skipped_requires_compliance', competitor };
  }

  if (competitor.game_platform_id) {
    return { status: 'skipped_already_synced', competitor };
  }

  const coachProfileId = coachContextId ?? competitor.coach_id;

  const { data: coachProfile, error: coachError } = await supabase
    .from('profiles')
    .select('id, role, is_approved, game_platform_user_id, email, first_name, last_name, full_name, school_name, division')
    .eq('id', coachProfileId ?? competitor.coach_id)
    .maybeSingle();

  if (
    coachError ||
    !coachProfile ||
    coachProfile.role !== 'coach' ||
    coachProfile.is_approved === false
  ) {
    await updateCompetitorSyncError(
      supabase,
      competitorId,
      'Coach not found or not approved connection'
    );
    throw new Error('Coach not found or not approved connection');
  }

  const resolvedClient = resolveClient(client, logger);

  let synedCoachUserId =
    competitor.syned_coach_user_id ??
    (competitor as any).coach_game_platform_id ??
    coachProfile.game_platform_user_id ??
    (IS_MOCK_INTEGRATION ? coachProfile.id : null) ??
    null;

  if (!synedCoachUserId && !effectiveDryRun) {
    synedCoachUserId = await ensureCoachGamePlatformId(supabase, resolvedClient, coachProfile, logger);
  }

  const userPayload: CreateUserPayload = {
    first_name: competitor.first_name,
    last_name: competitor.last_name,
    email: competitor.email_school || competitor.email_personal,
    preferred_username: buildPreferredUsername(competitor),
    role: 'user',
    // Competitors inherit school/region from coach if not set
    syned_school_id: competitor.syned_school_id ?? coachProfile.school_name ?? 'Unknown School',
    syned_region_id: competitor.syned_region_id ?? coachProfile.division ?? 'high_school',
    syned_coach_user_id: synedCoachUserId,
    syned_user_id: String(competitor.game_platform_id ?? competitor.id),
  };

  // Log the complete payload for debugging
  logger?.info?.('📤 MetaCTF API - Creating competitor with payload:', {
    competitorId,
    payload: userPayload,
    coachProfile: {
      id: coachProfile.id,
      game_platform_user_id: coachProfile.game_platform_user_id,
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
        status: 'mocked',
        competitor,
        remote: {
          mocked: true,
          expectedPayload: userPayload,
        },
      };
    }

    logger?.info?.('🚀 Sending createUser request to MetaCTF API...');
    const remoteResult = await resolvedClient.createUser(userPayload);
    logger?.info?.('✅ MetaCTF API response:', remoteResult);
    // Store the syned_user_id (UUID) for linking, not the metactf_user_id (numeric)
    const remoteUserId = String((remoteResult as any)?.syned_user_id ?? null);

    if (!remoteUserId) {
      await updateCompetitorSyncError(supabase, competitorId, 'Game Platform did not return a syned_user_id');
      throw new Error('Game Platform did not return a syned_user_id');
    }

    const updatedCompetitor = await persistCompetitorSyncSuccess(supabase, competitorId, competitor, remoteUserId);

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

  if (!team.syned_coach_user_id && !team.coach_game_platform_id && !team.coach_id) {
    await updateTeamSyncError(supabase, teamId, 'Missing Game Platform coach mapping');
    return {
      status: 'skipped_missing_coach_mapping',
      team,
    };
  }

  const { data: coachProfile, error: coachError } = await supabase
    .from('profiles')
    .select('id, role, is_approved, game_platform_user_id, email, first_name, last_name, full_name, school_name, division')
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
    (IS_MOCK_INTEGRATION ? coachProfile.id : null) ??
    null;

  if (!coachMetaId && !effectiveDryRun) {
    coachMetaId = await ensureCoachGamePlatformId(supabase, resolvedClient, coachProfile, logger);
  }

  const affiliationFallback = (team.affiliation && team.affiliation.trim().length > 0)
    ? team.affiliation
    : coachProfile.school_name ?? 'Unknown';

  const divisionSource = team.division ?? null;

  const teamPayload: CreateTeamPayload = {
    syned_coach_user_id: coachMetaId,
    syned_team_id: team.game_platform_id ?? team.id,
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
  let remoteTeamId = team.game_platform_id ?? null;
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

    await persistTeamSyncSuccess(supabase, teamId, team, remoteTeamId, coachMetaId);
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
  const unassignedMembers: Array<{ synedUserId: string; remote?: any }> = [];

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
      for (const synedUserId of membersToUnassign) {
        try {
          const unassignResult = await (resolvedClientInstance as GamePlatformClient).unassignMemberFromTeam({
            syned_user_id: synedUserId,
          });
          unassignedMembers.push({ synedUserId, remote: unassignResult });
          logger?.info?.(`Unassigned member ${synedUserId} from team ${remoteTeamId}`);
        } catch (unassignError: any) {
          logger?.warn?.(`Failed to unassign member ${synedUserId} from team ${remoteTeamId}`, { error: unassignError });
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
        assignedMembers.push({ competitorId: member.id, remote: { mocked: true } });
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
      status: 'mocked',
      team,
      assignedMembers,
      skippedMembers,
      unassignedMembers,
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

  if (!team.game_platform_id) {
    logger?.info?.(`Team ${teamId} has no game_platform_id, skipping remote deletion`);
    return {
      status: 'skipped_not_synced',
      team,
    };
  }

  if (effectiveDryRun) {
    return {
      status: 'mocked',
      team,
    };
  }

  const resolvedClient = resolveClient(client, logger);

  try {
    await resolvedClient.deleteTeam({ syned_team_id: team.game_platform_id });
    logger?.info?.(`Successfully deleted team ${teamId} from Game Platform`);
  } catch (error: any) {
    logger?.error?.('Failed to delete team from Game Platform', { teamId, error });
    throw error;
  }

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

async function persistTeamSyncSuccess(
  supabase: AnySupabaseClient,
  teamId: string,
  team: any,
  remoteTeamId: string,
  coachMetaId?: string | null,
) {
  const { data, error } = await supabase
    .from('teams')
    .update({
      game_platform_id: remoteTeamId,
      game_platform_synced_at: new Date().toISOString(),
      game_platform_sync_error: null,
      ...(coachMetaId ? { syned_coach_user_id: coachMetaId } : {}),
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
  globalAfterTimeUnix,
  skipFlashCtfSync,
}: SyncCompetitorStatsParams): Promise<SyncCompetitorStatsResult> {
  const { data: competitor, error } = await supabase
    .from('competitors')
    .select('id, first_name, last_name, coach_id, game_platform_id, team_members:team_members(team_id, teams!inner(game_platform_id))')
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

  const synedUserId = competitor.game_platform_id;
  const effectiveDryRun = isDryRunOverride(dryRun);

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

  if (globalAfterTimeUnix !== undefined) {
    // Global timestamp provided by batch sync
    afterTimeUnix = globalAfterTimeUnix;
  } else {
    // Fall back to per-user timestamp (for standalone competitor syncs)
    const { data: syncState } = await supabase
      .from('game_platform_sync_state')
      .select('last_odl_synced_at')
      .eq('syned_user_id', synedUserId)
      .maybeSingle();

    const lastOdlSyncedAt = syncState?.last_odl_synced_at;
    afterTimeUnix = lastOdlSyncedAt ? Math.floor(new Date(lastOdlSyncedAt).getTime() / 1000) : null;
  }

  logger?.info?.(
    afterTimeUnix
      ? `Incremental ODL sync for ${synedUserId} after ${new Date(afterTimeUnix * 1000).toISOString()}`
      : `Full ODL sync for ${synedUserId} (first sync)`
  );

  let scores: any = null;
  let scoresError: unknown = null;
  let missingRemoteUser = false;
  let missingRemoteMessage: string | null = null;
  try {
    scores = await resolvedClient.getScores({
      syned_user_id: synedUserId,
      after_time_unix: afterTimeUnix,
    });
  } catch (err: any) {
    if (err?.status === 404) {
      missingRemoteUser = true;
      missingRemoteMessage = typeof err?.message === 'string'
        ? err.message
        : `ODL scores unavailable for ${synedUserId}`;
      logger?.info?.(`ODL scores missing for ${synedUserId}`);
    } else {
      scoresError = err;
      logger?.warn?.(`Failed to fetch ODL scores for ${synedUserId}`, { error: err });
    }
  }

  if (missingRemoteUser) {
    const message = missingRemoteMessage ?? `ODL scores unavailable for ${synedUserId}`;

    await updateCompetitorSyncError(supabase, competitorId, message);

    const { error: syncStateMissingError } = await statsClient
      .from('game_platform_sync_state')
      .upsert({
        syned_user_id: synedUserId,
        last_attempt_at: new Date().toISOString(),
        last_result: 'failure',
        error_message: message.slice(0, 500),
      });

    if (syncStateMissingError) {
      throw new Error(`Failed to persist sync failure state: ${syncStateMissingError.message}`);
    }

    return {
      competitorId,
      status: 'skipped_remote_missing',
      message,
    };
  }

  if (scoresError) {
    const message = scoresError instanceof Error
      ? scoresError.message
      : 'Failed to fetch ODL scores';

    const syncStateFailurePayload = {
      syned_user_id: synedUserId,
      last_attempt_at: new Date().toISOString(),
      last_result: 'failure' as const,
      error_message: message.slice(0, 500),
    };

    const { error: syncStateFailureError } = await statsClient
      .from('game_platform_sync_state')
      .upsert(syncStateFailurePayload);

    if (syncStateFailureError) {
      throw new Error(`Failed to persist sync failure state: ${syncStateFailureError.message}`);
    }

    return {
      competitorId,
      status: 'error',
      message,
    };
  }

  let flash: any = null;

  // Only fetch Flash CTF data if sentinel detected new events (or if we're forcing a full sync)
  if (!skipFlashCtfSync) {
    try {
      flash = await resolvedClient.getFlashCtfProgress({ syned_user_id: synedUserId });
    } catch (err: any) {
      if (err?.status === 404) {
        logger?.info?.(`No Flash CTF progress for ${synedUserId}`);
      } else {
        logger?.warn?.(`Failed to fetch Flash CTF progress for ${synedUserId}`, { error: err });
      }
    }
  }

  const normalizedScores = Array.isArray(scores) ? scores[0] : scores;
  const odlSolves = Array.isArray(normalizedScores?.challenge_solves)
    ? normalizedScores.challenge_solves
    : [];

  const hasNewOdlSolves = odlSolves.length > 0;

  // Skip calculating totals here - handled by separate sweep job
  const lastActivityUnix = normalizedScores?.last_accessed_unix_timestamp ?? null;
  const lastActivity = lastActivityUnix ? new Date(lastActivityUnix * 1000).toISOString() : null;
  const flashEntries: any[] = flash?.flash_ctfs ?? [];

  const synedTeamId = Array.isArray((competitor as any).team_members) && (competitor as any).team_members[0]?.teams?.game_platform_id
    ? (competitor as any).team_members[0].teams.game_platform_id
    : null;
  const metactfUserId = normalizedScores?.metactf_user_id ?? null;

  const flashSolveRows: any[] = [];
  const flashEventRows: any[] = [];

  let latestFlashStart: string | null = null;

  for (const entry of flashEntries) {
    const start = entry?.flash_ctf_time_start_unix ? new Date(entry.flash_ctf_time_start_unix * 1000).toISOString() : null;
    const end = entry?.flash_ctf_time_end_unix ? new Date(entry.flash_ctf_time_end_unix * 1000).toISOString() : null;
    const eventId = entry?.event_id ?? `${entry?.flash_ctf_name ?? 'flash_ctf'}:${entry?.flash_ctf_time_start_unix ?? Date.now()}`;

    flashEventRows.push({
      syned_user_id: synedUserId,
      metactf_user_id: metactfUserId,
      event_id: eventId,
      flash_ctf_name: entry?.flash_ctf_name ?? null,
      challenges_solved: entry?.challenges_solved ?? 0,
      points_earned: entry?.points_earned ?? null,
      rank: entry?.rank ?? null,
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
          syned_user_id: synedUserId,
          metactf_user_id: metactfUserId,
          syned_team_id: synedTeamId,
          challenge_solve_id: solveId,
          challenge_id: solve?.challenge_id ?? null,
          challenge_title: solve?.challenge_title ?? null,
          challenge_category: solve?.challenge_category ?? null,
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
        syned_user_id: synedUserId,
        metactf_user_id: metactfUserId,
        syned_team_id: synedTeamId,
        challenge_solve_id: solveId,
        challenge_id: solve?.challenge_id ?? null,
        challenge_title: solve?.challenge_title ?? null,
        challenge_category: solve?.challenge_category ?? null,
        challenge_points: solve?.challenge_points ?? null,
        solved_at: solve?.timestamp_unix ? new Date(solve.timestamp_unix * 1000).toISOString() : null,
        source: 'odl',
        raw_payload: solve,
      };
    })
    .filter(Boolean) as any[];

  if (odlSolveRows.length) {
    const { error: upsertOdlError } = await statsClient
      .from('game_platform_challenge_solves')
      .upsert(odlSolveRows, { onConflict: 'syned_user_id,challenge_solve_id' });
    if (upsertOdlError) {
      throw new Error(`Failed to upsert ODL challenge solves: ${upsertOdlError.message}`);
    }
  }

  if (flashSolveRows.length) {
    const { error: upsertFlashSolveError } = await statsClient
      .from('game_platform_challenge_solves')
      .upsert(flashSolveRows, { onConflict: 'syned_user_id,challenge_solve_id' });
    if (upsertFlashSolveError) {
      throw new Error(`Failed to upsert Flash CTF challenge solves: ${upsertFlashSolveError.message}`);
    }
  }

  if (flashEventRows.length) {
    const { error: upsertFlashEventError } = await statsClient
      .from('game_platform_flash_ctf_events')
      .upsert(flashEventRows, { onConflict: 'syned_user_id,event_id' });
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
    syned_user_id: synedUserId,
    last_odl_synced_at: new Date().toISOString(),
    last_flash_ctf_synced_at: latestFlashStart,
    last_remote_accessed_at: lastActivity,
    last_attempt_at: new Date().toISOString(),
    last_result: 'success' as const,
    error_message: null as string | null,
    // Set refresh flag to true if new activity detected OR if stats row doesn't exist, otherwise false
    needs_totals_refresh: needsRefresh || needsStatsRowCreation,
  };

  const { error: upsertSyncStateError } = await statsClient
    .from('game_platform_sync_state')
    .upsert(syncStatePayload);
  if (upsertSyncStateError) {
    throw new Error(`Failed to update sync state: ${upsertSyncStateError.message}`);
  }

  if (needsRefresh) {
    logger?.info?.(`Marked ${synedUserId} for totals refresh (${odlSolves.length} new ODL, ${flashEntries.length} flash events)`);
  } else if (needsStatsRowCreation) {
    logger?.info?.(`Marked ${synedUserId} for totals refresh (stats row doesn't exist)`);
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
  synedUserId: string;
}

export async function refreshCompetitorTotals({
  supabase,
  client,
  competitorId,
  synedUserId,
  dryRun,
  logger,
}: RefreshCompetitorTotalsParams): Promise<void> {
  const effectiveDryRun = isDryRunOverride(dryRun);

  if (effectiveDryRun) {
    logger?.info?.(`[DRY RUN] Would refresh totals for ${synedUserId}`);
    return;
  }

  const resolvedClient = resolveClient(client, logger);
  const statsClient: AnySupabaseClient = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : supabase;

  // Fetch fresh totals (no after_time_unix parameter)
  let freshScores: any = null;
  try {
    freshScores = await resolvedClient.getScores({ syned_user_id: synedUserId });
  } catch (err: any) {
    // If user doesn't exist in game platform (404), clear the refresh flag and skip
    if (err?.status === 404) {
      logger?.warn?.(`User ${synedUserId} not found in game platform, clearing refresh flag`);
      await statsClient
        .from('game_platform_sync_state')
        .update({ needs_totals_refresh: false })
        .eq('syned_user_id', synedUserId);
      return; // Skip this user gracefully
    }
    logger?.error?.(`Failed to fetch fresh totals for ${synedUserId}`, { error: err });
    throw err;
  }

  const normalizedScores = Array.isArray(freshScores) ? freshScores[0] : freshScores;
  const totalChallenges = normalizedScores?.total_challenges_solved ?? 0;
  const totalPoints = normalizedScores?.total_points ?? 0;

  // Fetch Flash CTF totals
  let flash: any = null;
  try {
    flash = await resolvedClient.getFlashCtfProgress({ syned_user_id: synedUserId });
  } catch (err: any) {
    if (err?.status !== 404) {
      logger?.warn?.(`Failed to fetch Flash CTF for totals refresh ${synedUserId}`, { error: err });
    }
  }

  const flashEntries: any[] = flash?.flash_ctfs ?? [];
  const monthlyCtfChallenges = flashEntries.reduce((sum, entry) => sum + (entry?.challenges_solved ?? 0), 0);

  // Update totals in game_platform_stats
  const existing = await getOrCreateStatsRow(statsClient, competitorId);

  // Get last_activity from the freshly fetched scores
  const lastActivityUnix = normalizedScores?.last_accessed_unix_timestamp ?? null;
  const lastActivity = lastActivityUnix ? new Date(lastActivityUnix * 1000).toISOString() : null;

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
    .eq('syned_user_id', synedUserId);

  if (clearFlagError) {
    logger?.warn?.(`Failed to clear totals refresh flag for ${synedUserId}`, { error: clearFlagError });
  }

  logger?.info?.(`Refreshed totals for ${synedUserId}: ${totalChallenges} challenges, ${totalPoints} points`);
}

export interface SweepPendingTotalsRefreshParams extends ServiceOptions {
  coachId?: string | null;
  batchSize?: number;
}

export async function sweepPendingTotalsRefresh({
  supabase,
  client,
  dryRun,
  logger,
  coachId,
  batchSize = 100,
}: SweepPendingTotalsRefreshParams) {
  const effectiveDryRun = isDryRunOverride(dryRun);
  const statsClient: AnySupabaseClient = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : supabase;

  // Find all competitors needing totals refresh
  let pendingQuery = statsClient
    .from('game_platform_sync_state')
    .select('syned_user_id')
    .eq('needs_totals_refresh', true)
    .limit(batchSize);

  const { data: pendingStates, error: queryError } = await pendingQuery;

  if (queryError) {
    throw new Error(`Failed to query pending totals refresh: ${queryError.message}`);
  }

  const pendingUserIds = (pendingStates || []).map(s => s.syned_user_id);

  if (pendingUserIds.length === 0) {
    logger?.info?.('No competitors need totals refresh');
    return {
      total: 0,
      refreshed: 0,
      failed: 0,
      results: [],
    };
  }

  logger?.info?.(`Found ${pendingUserIds.length} competitors needing totals refresh`);

  // Map syned_user_id back to competitor_id
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

  const results: Array<{ synedUserId: string; status: 'success' | 'failed'; error?: string }> = [];
  let refreshed = 0;
  let failed = 0;

  for (const competitor of competitors || []) {
    if (!competitor.game_platform_id) continue;

    try {
      await refreshCompetitorTotals({
        supabase,
        client,
        competitorId: competitor.id,
        synedUserId: competitor.game_platform_id,
        dryRun: effectiveDryRun,
        logger,
      });
      results.push({ synedUserId: competitor.game_platform_id, status: 'success' });
      refreshed++;
    } catch (err: any) {
      logger?.error?.(`Failed to refresh totals for ${competitor.game_platform_id}`, { error: err });
      results.push({
        synedUserId: competitor.game_platform_id,
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
  };
}

export async function syncAllCompetitorGameStats({
  supabase,
  client,
  dryRun,
  logger,
  coachId,
  forceFullSync,
}: SyncAllCompetitorStatsParams) {
  const statsClient: AnySupabaseClient = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : supabase;

  // Create a sync run record to track this batch
  const { data: syncRun, error: syncRunError } = await statsClient
    .from('game_platform_sync_runs')
    .insert({
      status: 'running',
      sync_type: 'incremental',
    })
    .select()
    .single();

  if (syncRunError || !syncRun) {
    throw new Error(`Failed to create sync run: ${syncRunError?.message}`);
  }

  const syncRunId = syncRun.id;

  // Get the last successful sync timestamp to use as after_time_unix for all competitors
  let globalAfterTime: number | null = null;

  if (forceFullSync) {
    logger?.info?.('forceFullSync enabled - performing full sync for all competitors (ignoring last sync timestamp)');
  } else {
    const { data: lastSync } = await statsClient
      .from('game_platform_sync_runs')
      .select('completed_at')
      .eq('status', 'completed')
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
  }

  let competitorQuery = supabase
    .from('competitors')
    .select('id, coach_id, game_platform_id')
    .not('game_platform_id', 'is', null);

  if (coachId) {
    competitorQuery = competitorQuery.eq('coach_id', coachId);
  }

  const { data: competitors, error } = await competitorQuery;

  if (error) {
    // Mark sync run as failed
    await statsClient
      .from('game_platform_sync_runs')
      .update({ status: 'failed', error_message: error.message })
      .eq('id', syncRunId);
    throw new Error(`Failed to list competitors for stats sync: ${error.message}`);
  }

  // Sentinel user detection for Flash CTF events
  // Flash CTF events are monthly and global - if one user has a new event, all users can participate
  // We check a "sentinel" user to detect new events before syncing all users
  let hasNewFlashCtfEvent = false;
  const resolvedClient = resolveClient(client, logger);

  if (competitors && competitors.length > 0) {
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

  const results: SyncCompetitorStatsResult[] = [];

  logger?.info?.(`Starting incremental sync for ${competitors?.length ?? 0} competitors`);

  for (const competitor of competitors || []) {
    const result = await syncCompetitorGameStats({
      supabase,
      client,
      competitorId: competitor.id,
      dryRun,
      logger,
      globalAfterTimeUnix: globalAfterTime,
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
  };
}

type SyncAllTeamsParams = {
  supabase: AnySupabaseClient;
  client?: GamePlatformClient | GamePlatformClientMock;
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
