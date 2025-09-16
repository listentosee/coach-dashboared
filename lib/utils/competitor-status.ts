export function calculateCompetitorStatus(competitor: any): string {
  // Base demographic requirements (apply to all)
  const hasCore =
    !!competitor.grade &&
    !!competitor.gender &&
    !!competitor.race &&
    !!competitor.ethnicity &&
    !!competitor.level_of_technology &&
    (competitor.years_competing !== null && competitor.years_competing !== undefined)

  // Adults must have school email; minors may not
  const adultEmailOk = competitor.is_18_or_over ? !!competitor.email_school : true

  // Minors must have guardian fields to be considered profile complete
  const minorGuardianOk = competitor.is_18_or_over ? true : (!!competitor.parent_name && !!competitor.parent_email)

  // If any required profile fields are missing, remain 'pending'
  if (!hasCore || !adultEmailOk || !minorGuardianOk) return 'pending'

  // At this point the profile is complete
  // Next gate: compliance (release signed)
  const hasRelease = competitor.is_18_or_over
    ? !!competitor.participation_agreement_date
    : !!competitor.media_release_date

  if (!hasRelease) return 'profile'

  // Next gate: platform assignment
  if (!competitor.game_platform_id) return 'compliance'

  return 'complete'
}

// Bulk status update function for maintenance
export async function updateAllCompetitorStatuses(supabase: any) {
  try {
    // Get all competitors
    const { data: competitors, error } = await supabase
      .from('competitors')
      .select('*');
    
    if (error) throw error;
    
    let updated = 0;
    let errors = 0;
    const errorDetails: any[] = [];
    
    // Update each competitor's status
    for (const competitor of competitors) {
      try {
        const newStatus = calculateCompetitorStatus(competitor);
        
        const { error: updateError } = await supabase
          .from('competitors')
          .update({ status: newStatus })
          .eq('id', competitor.id);
        
        if (updateError) {
          errorDetails.push({
            competitor: `${competitor.first_name} ${competitor.last_name}`,
            error: updateError.message,
            calculatedStatus: newStatus
          });
          console.error(`Error updating ${competitor.first_name} ${competitor.last_name}:`, updateError);
          errors++;
        } else {
          updated++;
        }
      } catch (err: any) {
        errorDetails.push({
          competitor: `${competitor.first_name} ${competitor.last_name}`,
          error: err.message
        });
        console.error(`Error processing ${competitor.first_name} ${competitor.last_name}:`, err);
        errors++;
      }
    }
    
    return { updated, errors, total: competitors.length, errorDetails };
  } catch (error) {
    console.error('Bulk status update failed:', error);
    throw error;
  }
}

export function getStatusDescription(status: 'pending' | 'profile' | 'compliance' | 'complete'): string {
  switch (status) {
    case 'pending':
      return 'Waiting for profile update';
    case 'profile':
      return 'Waiting for release completion';
    case 'compliance':
      return 'Release form is complete';
    case 'complete':
      return 'On the game platform';
    default:
      return 'Unknown status';
  }
}
