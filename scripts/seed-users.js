#!/usr/bin/env node

/**
 * Seed Test Users for Dev/Preview Environments
 *
 * Creates canonical admin/coach accounts using the Supabase Admin API and
 * mirrors the associated profile rows so RLS behaves the same as production.
 *
 * Usage: node scripts/seed-users.js
 */

const fs = require('node:fs')
const path = require('node:path')
const dotenv = require('dotenv')
const { createClient } = require('@supabase/supabase-js')

const envFiles = ['.env.local', '.env']
for (const file of envFiles) {
  const fullPath = path.resolve(process.cwd(), file)
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath, override: true })
  }
}

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required in environment')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function buildProfilePayload(userDef, userId) {
  const meta = userDef.user_metadata ?? {}
  const firstName = meta.first_name ?? null
  const lastName = meta.last_name ?? null
  const composedName = [firstName, lastName].filter(Boolean).join(' ').trim()
  const fullName =
    meta.full_name ??
    meta.name ??
    (composedName.length > 0 ? composedName : null)
  const role = meta.role ?? 'coach'

  return {
    id: userId,
    email: userDef.email,
    role,
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
    school_name: meta.school_name ?? null,
    mobile_number: meta.mobile_number ?? null,
    division: meta.division ?? null,
    region: meta.region ?? null,
    monday_coach_id: meta.monday_coach_id ?? null,
    is_approved:
      typeof meta.is_approved === 'boolean'
        ? meta.is_approved
        : role === 'admin',
    live_scan_completed: meta.live_scan_completed ?? false,
    mandated_reporter_completed: meta.mandated_reporter_completed ?? false,
    updated_at: new Date().toISOString(),
  }
}

const testUsers = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'admin@test.com',
    password: 'TestPassword123!',
    user_metadata: {
      role: 'admin',
      first_name: 'Admin',
      last_name: 'User',
      school_name: 'IE Mayors Cup HQ',
    },
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'coach.active@test.com',
    password: 'TestPassword123!',
    user_metadata: {
      role: 'coach',
      first_name: 'Sarah',
      last_name: 'Johnson',
      school_name: 'Valley High School',
      division: 'high_school',
      region: 'Riverside',
      is_approved: true,
      live_scan_completed: true,
      mandated_reporter_completed: true,
    },
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    email: 'coach.pending@test.com',
    password: 'TestPassword123!',
    user_metadata: {
      role: 'coach',
      first_name: 'Mike',
      last_name: 'Chen',
      school_name: 'Desert View Middle School',
      division: 'middle_school',
      region: 'San Bernardino',
      is_approved: false,
      live_scan_completed: false,
      mandated_reporter_completed: false,
    },
  },
  {
    id: '00000000-0000-0000-0000-000000000004',
    email: 'coach.college@test.com',
    password: 'TestPassword123!',
    user_metadata: {
      role: 'coach',
      first_name: 'Dr. Elena',
      last_name: 'Martinez',
      school_name: 'California State University SB',
      division: 'college',
      region: 'San Bernardino',
      is_approved: true,
      live_scan_completed: true,
      mandated_reporter_completed: true,
    },
  },
]

async function seedUsers() {
  console.log('🌱 Seeding test users...\n')

  for (const user of testUsers) {
    console.log(`Creating user: ${user.email}`)
    let createdUserId = user.id

    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: user.user_metadata,
      ...(user.id && { id: user.id }),
    })

    if (!error) {
      createdUserId = data.user.id
      console.log(`  ✅ Created (ID: ${createdUserId})`)
    } else {
      const message = typeof error.message === 'string' ? error.message.toLowerCase() : ''
      if (message.includes('exists')) {
        console.log('  ⚠️  Already exists, ensuring profile')
      } else {
        console.error(`  ❌ Error: ${error.message || error}`)
        throw error
      }
    }

    const profilePayload = buildProfilePayload(user, createdUserId)
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(profilePayload, { onConflict: 'id' })

    if (profileError) {
      throw new Error(`Profile upsert failed for ${user.email}: ${profileError.message}`)
    }
    console.log('  ✅ Profile ensured')
  }

  console.log('\n✅ User seeding complete!')
  console.log('\nTest credentials:')
  console.log('  Email: admin@test.com (or any seeded email)')
  console.log('  Password: TestPassword123!')
  process.exit(0)
}

seedUsers().catch((err) => {
  console.error('\nFailed to seed users:', err)
  const code = err?.cause?.code || err?.code
  if (code === 'ENOTFOUND') {
    console.error('  Hint: run this script from a networked environment or verify SUPABASE_URL.')
  }
  process.exit(1)
})
