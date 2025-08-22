import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Users, Trophy, BarChart3 } from 'lucide-react'

export default function Home() {
  return (
    <div className="min-h-screen bg-meta-dark text-meta-light">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-meta-light sm:text-6xl">
            Coaches Dashboard
          </h1>
          <p className="mt-6 text-xl text-meta-muted max-w-3xl mx-auto">
            Comprehensive platform for managing competitors, teams, and tracking progress in cybersecurity competitions.
          </p>
          <div className="mt-10 flex justify-center space-x-4">
            <Link href="/auth/login">
              <Button size="lg" className="bg-meta-accent hover:bg-blue-600">
                Sign In
              </Button>
            </Link>
            <Link href="/auth/register">
              <Button variant="outline" size="lg" className="border-meta-border text-meta-light hover:bg-meta-accent hover:text-white">
                Register
              </Button>
            </Link>
          </div>
        </div>
        
        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-meta-accent">
              <Users className="h-6 w-6 text-white" />
            </div>
            <h3 className="mt-4 text-lg font-medium text-meta-light">Competitor Management</h3>
            <p className="mt-2 text-meta-muted">
              Add, edit, and track competitors with comprehensive status monitoring.
            </p>
          </div>
          
          <div className="text-center">
            <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-meta-accent">
              <Trophy className="h-6 w-6 text-white" />
            </div>
            <h3 className="mt-4 text-lg font-medium text-meta-light">Team Organization</h3>
            <p className="mt-2 text-meta-muted">
              Create and manage teams, assign competitors, and track team performance.
            </p>
          </div>
          
          <div className="text-center">
            <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-meta-accent">
              <BarChart3 className="h-6 w-6 text-white" />
            </div>
            <h3 className="mt-4 text-lg font-medium text-meta-light">Progress Tracking</h3>
            <p className="mt-2 text-meta-muted">
              Monitor competitor progress, document completion, and generate reports.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
