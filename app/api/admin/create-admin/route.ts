import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { email, password, fullName, firstName, lastName, schoolName, adminKey } = await request.json();
    
    // Validate required fields
    if (!email || !password || !fullName || !firstName || !lastName || !schoolName || !adminKey) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    // Check admin key - hash the provided key and compare with stored hash
    const expectedHash = process.env.ADMIN_CREATION_KEY_HASH;
    if (!expectedHash) {
      return NextResponse.json({ error: 'Admin creation not configured' }, { status: 500 });
    }

    const providedKeyHash = createHash('sha256').update(adminKey).digest('hex');
    if (providedKeyHash !== expectedHash) {
      return NextResponse.json({ error: 'Invalid admin key' }, { status: 401 });
    }

    // Create Supabase client with service role
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Check if user already exists
    const { data: existingUser } = await supabase.auth.admin.listUsers();
    if (existingUser.users.some(user => user.email === email)) {
      return NextResponse.json({ error: 'User already exists' }, { status: 409 });
    }

    // Create the admin user with proper JWT claims
    const { data: userData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: 'admin',
        name: fullName,
        first_name: firstName,
        last_name: lastName,
        school_name: schoolName
      },
      app_metadata: {
        role: 'admin' // This sets the role in JWT claims
      }
    });

    if (createError) {
      console.error('Error creating admin user:', createError);
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }

    // Create profile record
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: userData.user!.id,
        email: userData.user!.email!,
        role: 'admin',
        full_name: fullName,
        first_name: firstName,
        last_name: lastName,
        school_name: schoolName,
        is_approved: true,
        live_scan_completed: true,
        mandated_reporter_completed: true
      });

    if (profileError) {
      console.error('Error creating profile:', profileError);
      // Clean up the created user
      await supabase.auth.admin.deleteUser(userData.user!.id);
      return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `System administrator ${fullName} created successfully`,
      user: {
        id: userData.user!.id,
        email: userData.user!.email,
        role: 'admin'
      }
    });

  } catch (error) {
    console.error('Error creating admin:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
