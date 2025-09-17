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
  FileSignature,
  ChevronDown,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import AdminToolsLink from '@/components/dashboard/admin-tools-link';
import AdminContextSwitcher from '@/components/admin/AdminContextSwitcher';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [coachToolsExpanded, setCoachToolsExpanded] = useState(false);
  const [unread, setUnread] = useState<number>(0);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      
      if (user) {
        // Fetch coach profile
        const { data: profileData } = await supabase
          .from('profiles')
          .select('first_name, last_name, role')
          .eq('id', user.id)
          .single();
        
        setProfile(profileData);
      }
    };
    getUser();
  }, []);

  useEffect(() => {
    // Initial fetch
    fetch('/api/messaging/unread/count').then(async res => {
      if (res.ok) { const json = await res.json(); setUnread(json.count || 0) }
    })
    // Realtime updates
    const channel = supabase.channel('messages-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async () => {
        const res = await fetch('/api/messaging/unread/count'); if (res.ok) { const json = await res.json(); setUnread(json.count || 0) }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members' }, async () => {
        const res = await fetch('/api/messaging/unread/count'); if (res.ok) { const json = await res.json(); setUnread(json.count || 0) }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    const handler = () => {
      fetch('/api/messaging/unread/count').then(async res => {
        if (res.ok) {
          const json = await res.json()
          setUnread(json.count || 0)
        }
      })
    }
    window.addEventListener('unread-refresh', handler)
    return () => window.removeEventListener('unread-refresh', handler)
  }, [])

  const handleSignOut = async () => {
    try {
      // Clear admin context cookie server-side before logout
      await fetch('/api/admin/context', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coach_id: null }) })
    } catch {}
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
                Competitors
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
                Game Platform
              </Button>
            </Link>
            
            <Link href="/dashboard/releases">
              <Button variant="ghost" className="w-full justify-start text-meta-light hover:bg-meta-accent hover:text-white">
                <FileSignature className="h-5 w-5 mr-3" />
                Release Management
              </Button>
            </Link>

            <Link href="/dashboard/messages">
              <Button variant="ghost" className="w-full justify-start text-meta-light hover:bg-meta-accent hover:text-white">
                {/* Reusing Users icon for simplicity */}
                <Users className="h-5 w-5 mr-3" />
                Messages
                {unread > 0 && (
                  <span className="ml-auto inline-flex items-center justify-center rounded-full bg-red-600 text-white text-xs px-2 py-0.5">
                    {unread}
                  </span>
                )}
              </Button>
            </Link>
            
            {/* Admin Tools - Only visible to system administrators */}
            {typeof window !== 'undefined' && (
              <AdminToolsLink />
            )}
            
            {/* Coach Tools with Sub-menu */}
            <div>
              <Button 
                variant="ghost" 
                className="w-full justify-start text-meta-light hover:bg-meta-accent hover:text-white"
                onClick={() => setCoachToolsExpanded(!coachToolsExpanded)}
              >
                <Settings className="h-5 w-5 mr-3" />
                Coach Tools
                {coachToolsExpanded ? (
                  <ChevronDown className="h-4 w-4 ml-auto" />
                ) : (
                  <ChevronRight className="h-4 w-4 ml-auto" />
                )}
              </Button>
              
              {coachToolsExpanded && (
                <div className="ml-6 mt-1 space-y-1">
                  <Link href="/dashboard/settings">
                    <Button variant="ghost" size="sm" className="w-full justify-start text-meta-muted hover:bg-meta-accent hover:text-white text-sm">
                      Profile & Settings
                    </Button>
                  </Link>
                  {profile?.role !== 'admin' && (
                    <Link href="/dashboard/bulk-import">
                      <Button variant="ghost" size="sm" className="w-full justify-start text-meta-muted hover:bg-meta-accent hover:text-white text-sm">
                        Bulk Import
                      </Button>
                    </Link>
                  )}
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="w-full justify-start text-meta-muted hover:bg-meta-accent hover:text-white text-sm"
                    onClick={() => window.open('https://nuggets.cyber-guild.org', '_blank')}
                  >
                    CyberNuggets
                    <ExternalLink className="h-4 w-4 ml-auto" />
                  </Button>
                </div>
              )}
            </div>
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
          {/* Admin-only: Context switcher renders nothing for non-admins */}
          <AdminContextSwitcher />
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
