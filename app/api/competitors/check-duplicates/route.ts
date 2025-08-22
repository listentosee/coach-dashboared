import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { z } from 'zod';

const DuplicateCheckSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Verify authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const { first_name, last_name } = DuplicateCheckSchema.parse(body);

    // Check for competitors with similar names (same coach)
    const { data: duplicates, error } = await supabase
      .from('competitors')
      .select('id, first_name, last_name, email_school, grade, status')
      .eq('coach_id', session.user.id)
      .or(`first_name.ilike.${first_name},last_name.ilike.${last_name}`)
      .limit(5);

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to check duplicates' }, { status: 400 });
    }

    // Filter for exact or very similar matches
    const exactMatches = duplicates?.filter(comp => 
      comp.first_name.toLowerCase() === first_name.toLowerCase() && 
      comp.last_name.toLowerCase() === last_name.toLowerCase()
    ) || [];

    const similarMatches = duplicates?.filter(comp => 
      (comp.first_name.toLowerCase().includes(first_name.toLowerCase()) || 
       first_name.toLowerCase().includes(comp.first_name.toLowerCase())) &&
      (comp.last_name.toLowerCase().includes(last_name.toLowerCase()) || 
       last_name.toLowerCase().includes(comp.last_name.toLowerCase())) &&
      !(comp.first_name.toLowerCase() === first_name.toLowerCase() && 
        comp.last_name.toLowerCase() === last_name.toLowerCase())
    ) || [];

    return NextResponse.json({
      duplicates: [...exactMatches, ...similarMatches],
      exactMatches: exactMatches.length,
      similarMatches: similarMatches.length
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    
    console.error('Error checking duplicates:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
