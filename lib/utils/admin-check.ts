import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Check if the current user is an admin
 * @param supabase - Supabase client instance
 * @param userId - Current user ID
 * @returns Promise<boolean> - True if user is admin
 */
export async function isUserAdmin(
  supabase: SupabaseClient<any, 'public', any>,
  userId: string
): Promise<boolean> {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      return false;
    }

    return profile.role === 'admin';
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}
