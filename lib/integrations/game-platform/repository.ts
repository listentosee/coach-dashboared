import type { SupabaseClient } from '@supabase/supabase-js';

export type AnySupabaseClient = SupabaseClient<any, any, any>;

export type GamePlatformRole = 'coach' | 'user';

export type GamePlatformSyncStatus =
  | 'pending'
  | 'user_created'
  | 'approved'
  | 'denied'
  | 'error';

export interface GamePlatformProfileRecord {
  id: string;
  coach_id: string | null;
  competitor_id: string | null;
  metactf_role: GamePlatformRole;
  synced_user_id: string | null;
  metactf_user_id: number | null;
  metactf_username: string | null;
  status: GamePlatformSyncStatus;
  last_synced_at: string | null;
  sync_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface GamePlatformTeamRecord {
  id: string;
  team_id: string;
  synced_team_id: string | null;
  metactf_team_id: number | null;
  metactf_team_name: string | null;
  status: GamePlatformSyncStatus;
  last_synced_at: string | null;
  sync_error: string | null;
  created_at: string;
  updated_at: string;
}

interface ProfileSelectors {
  coachId?: string | null;
  competitorId?: string | null;
  syncedUserId?: string | null;
}

const DEFAULT_STATUS: GamePlatformSyncStatus = 'pending';

function resolveProfileConflictTarget(params: {
  coachId?: string | null;
  competitorId?: string | null;
}) {
  if (params.coachId) return 'coach_id';
  if (params.competitorId) return 'competitor_id';
  return 'synced_user_id';
}

function buildProfileFilter(
  supabase: AnySupabaseClient,
  selectors: ProfileSelectors,
) {
  let query = supabase.from('game_platform_profiles').select('*').limit(1);

  if (selectors.coachId) {
    query = query.eq('coach_id', selectors.coachId);
  } else if (selectors.competitorId) {
    query = query.eq('competitor_id', selectors.competitorId);
  } else if (selectors.syncedUserId) {
    query = query.eq('synced_user_id', selectors.syncedUserId);
  } else {
    throw new Error('GamePlatform profile selector requires an identifier');
  }

  return query;
}

export async function getGamePlatformProfile(
  supabase: AnySupabaseClient,
  selectors: ProfileSelectors,
): Promise<GamePlatformProfileRecord | null> {
  const { data, error } = await buildProfileFilter(supabase, selectors).maybeSingle();

  if (error) {
    throw new Error(`Failed to load game platform profile: ${error.message}`);
  }

  return data as GamePlatformProfileRecord | null;
}

export async function upsertGamePlatformProfile(
  supabase: AnySupabaseClient,
  params: {
    coachId?: string | null;
    competitorId?: string | null;
    metactfRole: GamePlatformRole;
    syncedUserId?: string | null;
    metactfUserId?: number | null;
    metactfUsername?: string | null;
    status?: GamePlatformSyncStatus | null;
    syncError?: string | null;
    lastSyncedAt?: string | null;
  },
): Promise<GamePlatformProfileRecord> {
  if (!params.coachId && !params.competitorId) {
    throw new Error('GamePlatform profile upsert requires coachId or competitorId');
  }

  const conflictTarget = resolveProfileConflictTarget({
    coachId: params.coachId,
    competitorId: params.competitorId,
  });

  const payload = {
    coach_id: params.coachId ?? null,
    competitor_id: params.competitorId ?? null,
    metactf_role: params.metactfRole,
    synced_user_id: params.syncedUserId ?? null,
    metactf_user_id: params.metactfUserId ?? null,
    metactf_username: params.metactfUsername ?? null,
    status: params.status ?? DEFAULT_STATUS,
    sync_error: params.syncError ?? null,
    last_synced_at: params.lastSyncedAt ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('game_platform_profiles')
    .upsert(payload, { onConflict: conflictTarget })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to upsert game platform profile: ${error?.message ?? 'unknown error'}`);
  }

  return data as GamePlatformProfileRecord;
}

export async function updateGamePlatformProfile(
  supabase: AnySupabaseClient,
  selectors: ProfileSelectors,
  updates: Partial<{
    metactfUserId: number | null;
    metactfUsername: string | null;
    status: GamePlatformSyncStatus;
    syncError: string | null;
    lastSyncedAt: string | null;
    syncedUserId: string | null;
  }>,
): Promise<GamePlatformProfileRecord | null> {
  const query = buildProfileFilter(supabase, selectors);
  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch game platform profile for update: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const payload = {
    metactf_user_id: updates.metactfUserId ?? data.metactf_user_id,
    metactf_username: updates.metactfUsername ?? data.metactf_username,
    status: updates.status ?? data.status,
    sync_error: updates.syncError ?? null,
    last_synced_at: updates.lastSyncedAt ?? data.last_synced_at,
    synced_user_id: updates.syncedUserId ?? data.synced_user_id,
    updated_at: new Date().toISOString(),
  };

  const { data: updated, error: updateError } = await supabase
    .from('game_platform_profiles')
    .update(payload)
    .eq('id', data.id)
    .select()
    .single();

  if (updateError || !updated) {
    throw new Error(
      `Failed to update game platform profile: ${updateError?.message ?? 'unknown error'}`,
    );
  }

  return updated as GamePlatformProfileRecord;
}

export async function getGamePlatformTeamByTeamId(
  supabase: AnySupabaseClient,
  teamId: string,
): Promise<GamePlatformTeamRecord | null> {
  const { data, error } = await supabase
    .from('game_platform_teams')
    .select('*')
    .eq('team_id', teamId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load game platform team: ${error.message}`);
  }

  return data as GamePlatformTeamRecord | null;
}

export async function upsertGamePlatformTeam(
  supabase: AnySupabaseClient,
  params: {
    teamId: string;
    syncedTeamId?: string | null;
    metactfTeamId?: number | null;
    metactfTeamName?: string | null;
    status?: GamePlatformSyncStatus | null;
    syncError?: string | null;
    lastSyncedAt?: string | null;
  },
): Promise<GamePlatformTeamRecord> {
  const payload = {
    team_id: params.teamId,
    synced_team_id: params.syncedTeamId ?? null,
    metactf_team_id: params.metactfTeamId ?? null,
    metactf_team_name: params.metactfTeamName ?? null,
    status: params.status ?? DEFAULT_STATUS,
    sync_error: params.syncError ?? null,
    last_synced_at: params.lastSyncedAt ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('game_platform_teams')
    .upsert(payload, { onConflict: 'team_id' })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to upsert game platform team: ${error?.message ?? 'unknown error'}`);
  }

  return data as GamePlatformTeamRecord;
}

export async function updateGamePlatformTeam(
  supabase: AnySupabaseClient,
  teamId: string,
  updates: Partial<{
    syncedTeamId: string | null;
    metactfTeamId: number | null;
    metactfTeamName: string | null;
    status: GamePlatformSyncStatus;
    syncError: string | null;
    lastSyncedAt: string | null;
  }>,
): Promise<GamePlatformTeamRecord | null> {
  const { data, error } = await supabase
    .from('game_platform_teams')
    .select('*')
    .eq('team_id', teamId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch game platform team for update: ${error.message}`);
  }

  if (!data) return null;

  const payload = {
    synced_team_id: updates.syncedTeamId ?? data.synced_team_id,
    metactf_team_id: updates.metactfTeamId ?? data.metactf_team_id,
    metactf_team_name: updates.metactfTeamName ?? data.metactf_team_name,
    status: updates.status ?? data.status,
    sync_error: updates.syncError ?? null,
    last_synced_at: updates.lastSyncedAt ?? data.last_synced_at,
    updated_at: new Date().toISOString(),
  };

  const { data: updated, error: updateError } = await supabase
    .from('game_platform_teams')
    .update(payload)
    .eq('id', data.id)
    .select()
    .single();

  if (updateError || !updated) {
    throw new Error(
      `Failed to update game platform team: ${updateError?.message ?? 'unknown error'}`,
    );
  }

  return updated as GamePlatformTeamRecord;
}
