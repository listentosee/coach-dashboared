export function calculateCompetitorStatus(competitor: any): string {
  // Check if all demographic fields are filled
  const hasBasicDemographics = 
    competitor.email_school && 
    competitor.grade && 
    competitor.gender && 
    competitor.race && 
    competitor.ethnicity && 
    competitor.level_of_technology && 
    (competitor.years_competing !== null && competitor.years_competing !== undefined);
  
  if (!hasBasicDemographics) return 'pending';
  
  // Check guardian fields for under 18
  if (!competitor.is_18_or_over) {
    if (!competitor.parent_name || !competitor.parent_email) {
      return 'profile'; // Missing guardian info
    }
  }
  
  // At this point, status is 'profile'
  
  // Check if we can advance to 'compliance'
  if (competitor.is_18_or_over) {
    if (competitor.participation_agreement_date) {
      return 'compliance';
    }
  } else {
    if (competitor.media_release_date) {
      return 'compliance';
    }
  }
  
  // Check if we can advance to 'complete'
  if (competitor.game_platform_id) {
    return 'complete';
  }
  
  return 'profile';
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
      return 'Profile incomplete - missing required demographic information';
    case 'profile':
      return 'Profile complete - missing required form signatures';
    case 'compliance':
      return 'Forms signed - missing game platform assignment';
    case 'complete':
      return 'Fully complete - all requirements met';
    default:
      return 'Unknown status';
  }
}
