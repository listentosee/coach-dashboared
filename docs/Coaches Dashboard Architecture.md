# Coaches Dashboard - Architecture & Implementation Document

## Table of Contents
1. [System Overview](#system-overview)
2. [Database Architecture](#database-architecture)
3. [Authentication & Authorization](#authentication--authorization)
4. [API Design](#api-design)
5. [Application Architecture](#application-architecture)
6. [Implementation Phases](#implementation-phases)
7. [Security & Compliance](#security--compliance)
8. [Monitoring & Maintenance](#monitoring--maintenance)

---

## System Overview

### Architecture Diagram
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Monday.com    │────▶│  Vercel/Next.js  │────▶│    Supabase     │
│  (Coach Data)   │     │   Application    │     │   PostgreSQL    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │                           │
                               ▼                           ▼
                        ┌──────────────┐           ┌──────────────┐
                        │ Game Platform│           │ Adobe Sign   │
                        │     API      │           │   (Forms)    │
                        └──────────────┘           └──────────────┘
```

### Technology Stack
- **Frontend**: Next.js 14+ (App Router), React 18+, TypeScript
- **UI Components**: shadcn/ui, Radix UI primitives
- **Styling**: Tailwind CSS 3.4+
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Realtime)
- **Hosting**: Vercel (Serverless Functions)
- **External Services**: Monday.com API, Adobe Sign, Game Platform API

---

## Database Architecture

### Supabase Schema Design

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable Row Level Security
ALTER DATABASE postgres SET "app.jwt_secret" TO 'your-jwt-secret';

-- ENUMS
CREATE TYPE user_role AS ENUM ('admin', 'coach');
CREATE TYPE competitor_status AS ENUM ('pending', 'active', 'inactive');
CREATE TYPE team_status AS ENUM ('forming', 'active', 'archived');

-- TABLES

-- 1. Profiles Table (extends Supabase Auth)
CREATE TABLE profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    role user_role NOT NULL DEFAULT 'coach',
    full_name TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    school_name TEXT NOT NULL,
    mobile_number TEXT,
    division TEXT,
    region TEXT,
    monday_coach_id TEXT UNIQUE,
    is_approved BOOLEAN DEFAULT false,
    live_scan_completed BOOLEAN DEFAULT false,
    mandated_reporter_completed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Competitors Table
CREATE TABLE competitors (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    coach_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    email_personal TEXT,
    email_school TEXT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    is_18_or_over BOOLEAN DEFAULT false,
    grade TEXT,
    parent_name TEXT,
    parent_email TEXT,
    gender TEXT,
    race TEXT,
    ethnicity TEXT,
    level_of_technology TEXT,
    years_competing INTEGER,
    media_release_signed BOOLEAN DEFAULT false,
    media_release_date TIMESTAMPTZ,
    participation_agreement_signed BOOLEAN DEFAULT false,
    participation_agreement_date TIMESTAMPTZ,
    adobe_sign_document_id TEXT,
    profile_update_token TEXT UNIQUE,
    profile_update_token_expires TIMESTAMPTZ,
    game_platform_id TEXT UNIQUE,
    game_platform_synced_at TIMESTAMPTZ,
    status competitor_status DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Teams Table
CREATE TABLE teams (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    coach_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    division TEXT,
    status team_status DEFAULT 'forming',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(coach_id, name)
);

-- 4. Team Members Table (Junction)
CREATE TABLE team_members (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
    competitor_id UUID REFERENCES competitors(id) ON DELETE CASCADE NOT NULL,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    position INTEGER CHECK (position >= 1 AND position <= 6),
    UNIQUE(team_id, competitor_id),
    UNIQUE(competitor_id) -- Ensures one team per competitor
);

-- 5. Game Platform Stats Table
CREATE TABLE game_platform_stats (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    competitor_id UUID REFERENCES competitors(id) ON DELETE CASCADE NOT NULL,
    challenges_completed INTEGER DEFAULT 0,
    monthly_ctf_challenges INTEGER DEFAULT 0,
    total_score INTEGER DEFAULT 0,
    last_activity TIMESTAMPTZ,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    raw_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Activity Logs Table
CREATE TABLE activity_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id),
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id UUID,
    metadata JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. System Configuration Table
CREATE TABLE system_config (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    updated_by UUID REFERENCES profiles(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES
CREATE INDEX idx_competitors_coach_id ON competitors(coach_id);
CREATE INDEX idx_competitors_status ON competitors(status);
CREATE INDEX idx_competitors_game_platform_id ON competitors(game_platform_id);
CREATE INDEX idx_team_members_team_id ON team_members(team_id);
CREATE INDEX idx_team_members_competitor_id ON team_members(competitor_id);
CREATE INDEX idx_game_platform_stats_competitor_id ON game_platform_stats(competitor_id);
CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at DESC);

-- ROW LEVEL SECURITY POLICIES

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_platform_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Competitors Policies (FERPA Compliant)
CREATE POLICY "Coaches can manage own competitors" ON competitors
    FOR ALL USING (auth.uid() = coach_id);

CREATE POLICY "Admins can view all competitors" ON competitors
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Teams Policies
CREATE POLICY "Coaches can manage own teams" ON teams
    FOR ALL USING (auth.uid() = coach_id);

CREATE POLICY "Admins can view all teams" ON teams
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Team Members Policies
CREATE POLICY "Coaches can manage own team members" ON team_members
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM teams 
            WHERE teams.id = team_members.team_id 
            AND teams.coach_id = auth.uid()
        )
    );

-- FUNCTIONS AND TRIGGERS

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_competitors_updated_at BEFORE UPDATE ON competitors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Team size constraint trigger
CREATE OR REPLACE FUNCTION check_team_size()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM team_members WHERE team_id = NEW.team_id) >= 6 THEN
        RAISE EXCEPTION 'Team cannot have more than 6 members';
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER enforce_team_size BEFORE INSERT ON team_members
    FOR EACH ROW EXECUTE FUNCTION check_team_size();

-- Generate secure token for competitor profile updates
CREATE OR REPLACE FUNCTION generate_profile_update_token()
RETURNS TRIGGER AS $$
BEGIN
    NEW.profile_update_token = encode(gen_random_bytes(32), 'hex');
    NEW.profile_update_token_expires = NOW() + INTERVAL '7 days';
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER set_profile_update_token BEFORE INSERT ON competitors
    FOR EACH ROW EXECUTE FUNCTION generate_profile_update_token();
```

---

## Authentication & Authorization

### Authentication Flow

```typescript
// /lib/auth/auth-service.ts
import { createClient } from '@supabase/supabase-js';
import { MondayClient } from '@/lib/integrations/monday';

export class AuthService {
  private supabase;
  private mondayClient;

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    this.mondayClient = new MondayClient();
  }

  async initializeCoach(email: string, password: string) {
    // 1. Verify coach exists in Monday.com
    const mondayCoach = await this.mondayClient.getCoachByEmail(email);
    
    if (!mondayCoach || !mondayCoach.isApproved) {
      throw new Error('Coach not found or not approved');
    }

    // 2. Create Supabase auth user
    const { data: authData, error: authError } = await this.supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role: 'coach',
          monday_coach_id: mondayCoach.id
        }
      }
    });

    if (authError) throw authError;

    // 3. Create profile record
    const { error: profileError } = await this.supabase
      .from('profiles')
      .insert({
        id: authData.user!.id,
        email: mondayCoach.email,
        role: 'coach',
        full_name: mondayCoach.fullName,
        first_name: mondayCoach.firstName,
        last_name: mondayCoach.lastName,
        school_name: mondayCoach.schoolName,
        mobile_number: mondayCoach.mobileNumber,
        division: mondayCoach.division,
        region: mondayCoach.region,
        monday_coach_id: mondayCoach.id,
        is_approved: true,
        live_scan_completed: mondayCoach.liveScanCompleted,
        mandated_reporter_completed: mondayCoach.mandatedReporterCompleted
      });

    if (profileError) throw profileError;

    return authData;
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
    return data;
  }

  async signOut() {
    const { error } = await this.supabase.auth.signOut();
    if (error) throw error;
  }

  async getSession() {
    const { data: { session } } = await this.supabase.auth.getSession();
    return session;
  }
}
```

### Authorization Middleware

```typescript
// /middleware.ts
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  
  const { data: { session } } = await supabase.auth.getSession();

  // Protect dashboard routes
  if (req.nextUrl.pathname.startsWith('/dashboard')) {
    if (!session) {
      return NextResponse.redirect(new URL('/login', req.url));
    }

    // Check user role for admin routes
    if (req.nextUrl.pathname.startsWith('/dashboard/admin')) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (profile?.role !== 'admin') {
        return NextResponse.redirect(new URL('/dashboard', req.url));
      }
    }
  }

  return res;
}

export const config = {
  matcher: ['/dashboard/:path*']
};
```

---

## API Design

### API Routes Structure

```typescript
// /app/api/routes.ts
export const API_ROUTES = {
  // Coach endpoints
  COACH: {
    PROFILE: '/api/coach/profile',
    DASHBOARD: '/api/coach/dashboard',
  },
  
  // Competitor endpoints
  COMPETITORS: {
    LIST: '/api/competitors',
    CREATE: '/api/competitors/create',
    UPDATE: '/api/competitors/[id]/update',
    DELETE: '/api/competitors/[id]/delete',
    GENERATE_TOKEN: '/api/competitors/[id]/generate-token',
    UPDATE_PROFILE: '/api/public/competitor-profile/[token]',
  },
  
  // Team endpoints
  TEAMS: {
    LIST: '/api/teams',
    CREATE: '/api/teams/create',
    UPDATE: '/api/teams/[id]/update',
    DELETE: '/api/teams/[id]/delete',
    ADD_MEMBER: '/api/teams/[id]/members/add',
    REMOVE_MEMBER: '/api/teams/[id]/members/remove',
  },
  
  // Game Platform integration
  GAME_PLATFORM: {
    ADD_COMPETITOR: '/api/game-platform/add-competitor',
    SYNC_STATS: '/api/game-platform/sync-stats',
  },
  
  // Admin endpoints
  ADMIN: {
    COACHES: '/api/admin/coaches',
    COMPETITORS: '/api/admin/competitors',
    ANALYTICS: '/api/admin/analytics',
    REPORTS: '/api/admin/reports',
  },
  
  // External integrations
  INTEGRATIONS: {
    MONDAY: '/api/integrations/monday/verify-coach',
    ADOBE_SIGN: '/api/integrations/adobe-sign/webhook',
  }
};
```

### Sample API Implementation

```typescript
// /app/api/competitors/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { z } from 'zod';

const CompetitorSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  is_18_or_over: z.boolean(),
  grade: z.string().optional(),
  email_personal: z.string().email().optional(),
  email_school: z.string().email().optional(),
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
    const validatedData = CompetitorSchema.parse(body);

    // Create competitor record
    const { data: competitor, error } = await supabase
      .from('competitors')
      .insert({
        ...validatedData,
        coach_id: session.user.id,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Generate profile update link
    const profileUpdateUrl = `${process.env.NEXT_PUBLIC_APP_URL}/update-profile/${competitor.profile_update_token}`;

    // Log activity
    await supabase
      .from('activity_logs')
      .insert({
        user_id: session.user.id,
        action: 'competitor_created',
        entity_type: 'competitor',
        entity_id: competitor.id,
        metadata: { competitor_name: `${competitor.first_name} ${competitor.last_name}` }
      });

    return NextResponse.json({
      competitor,
      profileUpdateUrl
    }, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    
    console.error('Error creating competitor:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

---

## Application Architecture

### Component Structure

```
/app
├── (auth)
│   ├── login
│   │   └── page.tsx
│   ├── register
│   │   └── page.tsx
│   └── layout.tsx
├── (public)
│   ├── update-profile
│   │   └── [token]
│   │       └── page.tsx
│   └── layout.tsx
├── dashboard
│   ├── (coach)
│   │   ├── competitors
│   │   │   ├── page.tsx
│   │   │   └── [id]
│   │   │       └── page.tsx
│   │   ├── teams
│   │   │   ├── page.tsx
│   │   │   └── [id]
│   │   │       └── page.tsx
│   │   ├── activity
│   │   │   └── page.tsx
│   │   └── page.tsx
│   ├── (admin)
│   │   ├── coaches
│   │   │   └── page.tsx
│   │   ├── analytics
│   │   │   └── page.tsx
│   │   ├── reports
│   │   │   └── page.tsx
│   │   └── page.tsx
│   └── layout.tsx
├── api
│   └── [...routes]
└── layout.tsx

/components
├── ui (shadcn components)
├── dashboard
│   ├── competitor-card.tsx
│   ├── competitor-form.tsx
│   ├── team-card.tsx
│   ├── team-form.tsx
│   ├── activity-chart.tsx
│   └── stats-overview.tsx
├── admin
│   ├── coaches-table.tsx
│   ├── analytics-dashboard.tsx
│   └── report-generator.tsx
└── shared
    ├── navbar.tsx
    ├── sidebar.tsx
    └── data-table.tsx

/lib
├── auth
├── api
├── integrations
│   ├── monday.ts
│   ├── adobe-sign.ts
│   └── game-platform.ts
├── utils
└── types
```

### Key Components

```typescript
// /components/dashboard/competitor-form.tsx
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { PlusCircle, Copy } from 'lucide-react';

const formSchema = z.object({
  first_name: z.string().min(2, 'First name must be at least 2 characters'),
  last_name: z.string().min(2, 'Last name must be at least 2 characters'),
  is_18_or_over: z.boolean(),
  grade: z.string().optional(),
  email_personal: z.string().email('Invalid email').optional().or(z.literal('')),
  email_school: z.string().email('Invalid email').optional().or(z.literal('')),
});

export function CompetitorForm({ onSuccess }: { onSuccess?: () => void }) {
  const [open, setOpen] = useState(false);
  const [profileLink, setProfileLink] = useState<string | null>(null);
  const { toast } = useToast();
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      is_18_or_over: false,
      grade: '',
      email_personal: '',
      email_school: '',
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      const response = await fetch('/api/competitors/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!response.ok) throw new Error('Failed to create competitor');
      
      const data = await response.json();
      setProfileLink(data.profileUpdateUrl);
      
      toast({
        title: 'Competitor added successfully',
        description: 'A secure link has been generated for profile completion.',
      });
      
      form.reset();
      onSuccess?.();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add competitor. Please try again.',
        variant: 'destructive',
      });
    }
  }

  const copyToClipboard = () => {
    if (profileLink) {
      navigator.clipboard.writeText(profileLink);
      toast({
        title: 'Link copied',
        description: 'Profile update link has been copied to clipboard.',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Competitor
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add New Competitor</DialogTitle>
          <DialogDescription>
            Enter the competitor's basic information. They will receive a secure link to complete their profile.
          </DialogDescription>
        </DialogHeader>
        
        {profileLink ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-semibold text-green-800 mb-2">Success!</h4>
              <p className="text-sm text-green-700 mb-3">
                Share this secure link with the competitor to complete their profile:
              </p>
              <div className="flex gap-2">
                <Input value={profileLink} readOnly className="text-xs" />
                <Button size="sm" onClick={copyToClipboard}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-green-600 mt-2">
                This link expires in 7 days
              </p>
            </div>
            <Button onClick={() => {
              setProfileLink(null);
              setOpen(false);
            }} className="w-full">
              Add Another Competitor
            </Button>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="is_18_or_over"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>18 or Over</FormLabel>
                      <FormDescription>
                        Is the competitor 18 years or older?
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="grade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Grade</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select grade level" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="9">9th Grade</SelectItem>
                        <SelectItem value="10">10th Grade</SelectItem>
                        <SelectItem value="11">11th Grade</SelectItem>
                        <SelectItem value="12">12th Grade</SelectItem>
                        <SelectItem value="college">College</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email_personal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Personal Email (Optional)</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email_school"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>School Email (Optional)</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Add Competitor</Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Set up Next.js project with TypeScript
- [ ] Configure Tailwind CSS and shadcn/ui
- [ ] Set up Supabase project and database schema
- [ ] Implement authentication system
- [ ] Create basic layout and navigation

### Phase 2: Coach Portal (Week 3-4)
- [ ] Implement Monday.com integration for coach verification
- [ ] Build coach registration and profile management
- [ ] Create competitor management interface
- [ ] Implement secure token generation for competitor profiles
- [ ] Build competitor listing with search and filters

### Phase 3: Team Management (Week 5)
- [ ] Create team CRUD operations
- [ ] Implement team member management
- [ ] Add validation for team size constraints
- [ ] Build team assignment interface from competitor listing

### Phase 4: External Integrations (Week 6-7)
- [ ] Integrate Adobe Sign webhooks for form status
- [ ] Build Game Platform API integration
- [ ] Implement competitor sync to Game Platform
- [ ] Create stats synchronization service

### Phase 5: Admin Dashboard (Week 8)
- [ ] Build admin authentication and authorization
- [ ] Create coach management interface
- [ ] Implement system-wide analytics dashboard
- [ ] Build reporting tools for divisions and regions

### Phase 6: Activity Dashboard & Visualization (Week 9)
- [ ] Implement real-time activity tracking
- [ ] Create competitor activity charts
- [ ] Build team performance visualizations
- [ ] Add export functionality for reports

### Phase 7: Testing & Optimization (Week 10)
- [ ] Comprehensive testing (unit, integration, e2e)
- [ ] Performance optimization
- [ ] Security audit
- [ ] Documentation completion

### Phase 8: Deployment & Launch (Week 11)
- [ ] Deploy to Vercel production
- [ ] Configure production Supabase instance
- [ ] Set up monitoring and logging
- [ ] User training and onboarding

---

## Security & Compliance

### FERPA Compliance
1. **Data Segmentation**: Strict RLS policies ensure coaches only access their own students' data
2. **Audit Logging**: All data access and modifications are logged
3. **Secure Tokens**: Time-limited, cryptographically secure tokens for student profile updates
4. **No Cross-Coach Visibility**: Complete isolation of competitor data between coaches
5. **Admin Oversight**: System admins have read-only access for reporting only

### Security Best Practices
```typescript
// Security configuration
export const SECURITY_CONFIG = {
  // Token expiration times
  PROFILE_UPDATE_TOKEN_EXPIRY: '7 days',
  SESSION_MAX_AGE: '8 hours',
  
  // Rate limiting
  API_RATE_LIMIT: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
  },
  
  // Password requirements
  PASSWORD_REQUIREMENTS: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
  },
  
  // CORS settings
  CORS_ORIGINS: [
    process.env.NEXT_PUBLIC_APP_URL,
    'https://*.adobe.com', // Adobe Sign webhooks
  ],
  
  // CSP headers
  CONTENT_SECURITY_POLICY: {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'https:'],
    'connect-src': ["'self'", '*.supabase.co'],
  },
};
```

### Data Protection
1. **Encryption at Rest**: All Supabase data encrypted using AES-256
2. **Encryption in Transit**: TLS 1.3 for all API communications
3. **PII Handling**: Minimal PII collection, secure storage, and controlled access
4. **Data Retention**: Automated cleanup of expired tokens and old activity logs
5. **Backup Strategy**: Daily automated backups with 30-day retention

---

## Monitoring & Maintenance

### Monitoring Setup

```typescript
// /lib/monitoring/index.ts
import * as Sentry from '@sentry/nextjs';
import { SupabaseClient } from '@supabase/supabase-js';

export class MonitoringService {
  static initializeSentry() {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 1.0,
      beforeSend(event, hint) {
        // Remove sensitive data
        if (event.request?.cookies) {
          delete event.request.cookies;
        }
        return event;
      },
    });
  }

  static async logActivity(
    supabase: SupabaseClient,
    userId: string,
    action: string,
    metadata?: any
  ) {
    try {
      await supabase.from('activity_logs').insert({
        user_id: userId,
        action,
        metadata,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      Sentry.captureException(error);
    }
  }

  static trackPerformance(metricName: string, value: number) {
    // Send to analytics service (e.g., Google Analytics, Mixpanel)
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'timing_complete', {
        name: metricName,
        value: Math.round(value),
      });
    }
  }
}
```

### Health Checks

```typescript
// /app/api/health/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const checks = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: false,
      authentication: false,
      storage: false,
    },
  };

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Check database
    const { error: dbError } = await supabase
      .from('system_config')
      .select('id')
      .limit(1);
    checks.services.database = !dbError;

    // Check auth service
    const { error: authError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    });
    checks.services.authentication = !authError;

    // Check storage
    const { error: storageError } = await supabase.storage.listBuckets();
    checks.services.storage = !storageError;

    // Determine overall status
    const allHealthy = Object.values(checks.services).every(v => v);
    checks.status = allHealthy ? 'healthy' : 'degraded';

    return NextResponse.json(checks, {
      status: allHealthy ? 200 : 503,
    });
  } catch (error) {
    checks.status = 'unhealthy';
    return NextResponse.json(checks, { status: 503 });
  }
}
```

### Maintenance Tasks

```typescript
// /lib/maintenance/tasks.ts
export const MAINTENANCE_TASKS = {
  // Daily tasks
  daily: [
    {
      name: 'cleanup_expired_tokens',
      schedule: '0 2 * * *', // 2 AM daily
      query: `
        UPDATE competitors 
        SET profile_update_token = NULL, 
            profile_update_token_expires = NULL 
        WHERE profile_update_token_expires < NOW()
      `,
    },
    {
      name: 'sync_game_platform_stats',
      schedule: '0 3 * * *', // 3 AM daily
      handler: 'syncGamePlatformStats',
    },
  ],
  
  // Weekly tasks
  weekly: [
    {
      name: 'cleanup_old_activity_logs',
      schedule: '0 4 * * 0', // 4 AM Sunday
      query: `
        DELETE FROM activity_logs 
        WHERE created_at < NOW() - INTERVAL '90 days'
      `,
    },
    {
      name: 'generate_weekly_reports',
      schedule: '0 6 * * 1', // 6 AM Monday
      handler: 'generateWeeklyReports',
    },
  ],
  
  // Monthly tasks
  monthly: [
    {
      name: 'archive_inactive_teams',
      schedule: '0 5 1 * *', // 5 AM, 1st of month
      query: `
        UPDATE teams 
        SET status = 'archived' 
        WHERE status = 'forming' 
        AND updated_at < NOW() - INTERVAL '60 days'
      `,
    },
  ],
};
```

---

## Appendix

### Environment Variables

```bash
# .env.local
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Application
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development

# Monday.com
MONDAY_API_TOKEN=your_monday_api_token
MONDAY_BOARD_ID=your_coaches_board_id

# Adobe Sign
ADOBE_SIGN_WEBHOOK_SECRET=your_webhook_secret

# Game Platform
GAME_PLATFORM_API_URL=https://api.gameplatform.com
GAME_PLATFORM_API_KEY=your_api_key

# Monitoring
SENTRY_DSN=your_sentry_dsn

# Email (optional - for notifications)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your_sendgrid_api_key
```

### Package Dependencies

```json
{
  "dependencies": {
    "@hookform/resolvers": "^3.3.4",
    "@radix-ui/react-avatar": "^1.0.4",
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-dropdown-menu": "^2.0.6",
    "@radix-ui/react-label": "^2.0.2",
    "@radix-ui/react-select": "^2.0.0",
    "@radix-ui/react-slot": "^1.0.2",
    "@radix-ui/react-switch": "^1.0.3",
    "@radix-ui/react-tabs": "^1.0.4",
    "@radix-ui/react-toast": "^1.1.5",
    "@sentry/nextjs": "^7.100.0",
    "@supabase/auth-helpers-nextjs": "^0.9.0",
    "@supabase/supabase-js": "^2.39.0",
    "@tanstack/react-query": "^5.17.0",
    "@tanstack/react-table": "^8.11.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "date-fns": "^3.2.0",
    "lucide-react": "^0.309.0",
    "next": "14.1.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-hook-form": "^7.48.0",
    "recharts": "^2.10.0",
    "tailwind-merge": "^2.2.0",
    "tailwindcss-animate": "^1.0.7",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/react": "^18.2.48",
    "@types/react-dom": "^18.2.18",
    "autoprefixer": "^10.4.17",
    "eslint": "^8.56.0",
    "eslint-config-next": "14.1.0",
    "postcss": "^8.4.33",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.3.3"
  }
}
```

---

## Conclusion

This architecture document provides a comprehensive blueprint for building the Coaches Dashboard application. The design prioritizes:

1. **Security & Compliance**: FERPA-compliant data isolation with comprehensive RLS policies
2. **Scalability**: Serverless architecture with Vercel and Supabase
3. **Maintainability**: Clear separation of concerns, TypeScript for type safety
4. **User Experience**: Modern UI with shadcn/ui components and real-time updates
5. **Integration Ready**: Structured to easily integrate with Monday.com, Adobe Sign, and Game Platform APIs

The phased implementation approach ensures steady progress with regular deliverables, while the monitoring and maintenance strategies ensure long-term reliability and performance.

For questions or clarifications during implementation, refer to this document as the source of truth for architectural decisions and implementation patterns.