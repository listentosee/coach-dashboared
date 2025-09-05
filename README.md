# Coaches Dashboard

A comprehensive web application for managing cybersecurity competition competitors and teams, built with Next.js 14, Supabase, and modern web technologies.

## Features

### 🏆 **Competitor Management**
- Add and manage competitors with secure profile completion links
- Track competitor status (pending, active, inactive)
- FERPA-compliant data isolation between coaches
- Secure token-based profile updates

### 👥 **Team Management**
- Create and manage competition teams
- Automatic team size validation (max 6 members)
- Team member assignment and tracking
- Team status management (forming, active, archived)

### 📊 **Dashboard & Analytics**
- Real-time dashboard with competitor and team statistics
- Activity logging and audit trails
- Performance tracking capabilities
- Search and filtering functionality

### 🔐 **Security & Compliance**
- Row-level security (RLS) policies
- FERPA-compliant data handling
- Secure authentication with Supabase Auth
- Comprehensive audit logging

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18+, TypeScript
- **UI Components**: shadcn/ui, Radix UI primitives
- **Styling**: Tailwind CSS 3.4+
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Realtime)
- **Hosting**: Vercel (Serverless Functions)
- **External Services**: Monday.com API, Adobe Sign, Game Platform API

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or pnpm
- Supabase account and project

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd coach-dashboared
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   pnpm install
   ```

3. **Environment Setup**
   Create a `.env.local` file with your Supabase credentials:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

4. **Database Setup**
   The database schema has been designed according to the architecture document. 
   Ensure your Supabase project has the required tables and RLS policies.

5. **Run the development server**
   ```bash
   npm run dev
   # or
   pnpm dev
   ```

6. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Project Structure

```
/app
├── (auth)                    # Authentication pages
│   ├── login/               # Coach login
│   └── register/            # Coach registration
├── (public)                 # Public pages
│   └── update-profile/      # Competitor profile updates
├── dashboard/               # Main dashboard
│   ├── (coach)             # Coach-specific pages
│   │   ├── competitors/    # Competitor management
│   │   ├── teams/          # Team management
│   │   └── activity/       # Activity logs
│   └── (admin)             # Admin pages (future)
├── api/                     # API routes
│   ├── competitors/         # Competitor API endpoints
│   ├── teams/              # Team API endpoints
│   └── integrations/       # External service integrations
└── layout.tsx              # Root layout

/components
├── ui/                      # Reusable UI components
├── dashboard/               # Dashboard-specific components
├── admin/                   # Admin components (future)
└── shared/                  # Shared components

/lib
├── auth/                    # Authentication services
├── api/                     # API utilities
├── integrations/            # External service integrations
├── utils/                   # Utility functions
└── types/                   # TypeScript type definitions
```

## Usage

### For Coaches

1. **Registration**: Create an account with your school information
2. **Login**: Access your personalized dashboard
3. **Add Competitors**: Create competitor profiles with secure update links
4. **Manage Teams**: Organize competitors into competition teams
5. **Track Progress**: Monitor competitor and team performance

### For Competitors

1. **Receive Link**: Get a secure profile completion link from your coach
2. **Complete Profile**: Fill out required information and agreements
3. **Stay Updated**: Keep your information current

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Code Style

- TypeScript for type safety
- ESLint for code quality
- Prettier for code formatting
- Tailwind CSS for styling

## Architecture

This project follows the architecture outlined in `docs/Coaches Dashboard Architecture.md`, which includes:

- **Security-first design** with FERPA compliance
- **Scalable architecture** using serverless functions
- **Real-time capabilities** with Supabase Realtime
- **Integration-ready** for external services

### In-App Messaging (Supabase-native)

This app uses Supabase (Postgres + RLS + Realtime) for a native, low-maintenance messaging system between admins and coaches, including a read-only Announcements channel.

- Schema: see `docs/messaging_schema.sql`
- Realtime: `messages` table is added to the realtime publication
- Security: RLS enforces that coaches only see their own conversations; admins see all

Coming next in the app:
- Dashboard “Messages” UI and minimal APIs for listing conversations and sending messages using the Supabase schema.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is proprietary and confidential.

## Support

For questions or support, please refer to the architecture documentation or contact the development team.
