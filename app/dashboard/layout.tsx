'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase/client';
import { 
  LayoutDashboard, 
  Users, 
  Trophy, 
  Settings, 
  LogOut,
  Menu,
  X,
  FileSignature
} from 'lucide-react';
import AdminToolsLink from '@/components/dashboard/admin-tools-link';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      
      if (user) {
        // Fetch coach profile
        const { data: profileData } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', user.id)
          .single();
        
        setProfile(profileData);
      }
    };
    getUser();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/auth/login');
  };

  return (
    <div className="min-h-screen bg-meta-dark text-meta-light">
      {/* Mobile sidebar toggle */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="text-meta-light hover:bg-meta-card"
        >
          {sidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </div>

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-meta-card shadow-lg transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {/* Logo/Brand */}
        <div className="p-6 border-b border-meta-border">
          <h1 className="text-2xl font-bold text-meta-light">Coaches Dashboard</h1>
        </div>

        {/* Search Field */}
        <div className="p-4 border-b border-meta-border">
          <Input
            placeholder="Search for competitor..."
            className="w-full bg-meta-dark border-meta-border text-meta-light placeholder:text-meta-muted"
            id="sidebar-search"
          />
        </div>

        {/* Navigation */}
        <nav className="mt-8">
          <div className="px-4 space-y-2">
            <Link href="/dashboard">
              <Button variant="ghost" className="w-full justify-start text-meta-light hover:bg-meta-accent hover:text-white">
                <LayoutDashboard className="h-5 w-5 mr-3" />
                Dashboard
              </Button>
            </Link>
            
            <Link href="/dashboard/teams">
              <Button variant="ghost" className="w-full justify-start text-meta-light hover:bg-meta-accent hover:text-white">
                <Users className="h-5 w-5 mr-3" />
                Teams
              </Button>
            </Link>
            
            <Link href="/dashboard/competitions">
              <Button variant="ghost" className="w-full justify-start text-meta-light hover:bg-meta-accent hover:text-white">
                <Trophy className="h-5 w-5 mr-3" />
                Competitions
              </Button>
            </Link>
            
            <Link href="/dashboard/releases">
              <Button variant="ghost" className="w-full justify-start text-meta-light hover:bg-meta-accent hover:text-white">
                <FileSignature className="h-5 w-5 mr-3" />
                Release Management
              </Button>
            </Link>
            
            {/* Admin Tools - Only visible to system administrators */}
            {typeof window !== 'undefined' && (
              <AdminToolsLink />
            )}
            
            <Link href="/dashboard/settings">
              <Button variant="ghost" className="w-full justify-start text-meta-light hover:bg-meta-accent hover:text-white">
                <Settings className="h-5 w-5 mr-3" />
                Settings
              </Button>
            </Link>
          </div>
        </nav>

        {/* User Info & Sign Out */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-meta-border">
          {user && profile && (
            <div className="mb-4">
              <p className="text-sm text-meta-light font-medium">
                Coach {profile.first_name} {profile.last_name}
              </p>
              <p className="text-xs text-meta-muted">{user.email}</p>
            </div>
          )}
          <Button
            variant="ghost"
            onClick={handleSignOut}
            className="w-full text-meta-light hover:bg-red-600 hover:text-white"
          >
            <LogOut className="h-5 w-5 mr-3" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`lg:ml-64 transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
        <div className="p-6">
          {children}
        </div>
      </main>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
