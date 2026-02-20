'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
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
  ExternalLink,
  BookOpen
} from 'lucide-react';
import AdminToolsLink from '@/components/dashboard/admin-tools-link';
import SingleSessionGuard from '@/components/SingleSessionGuard';
import AdminContextSwitcher from '@/components/admin/AdminContextSwitcher';
import { SearchProvider, useSearch } from '@/lib/contexts/SearchContext';

function DashboardLayoutInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [coachToolsExpanded, setCoachToolsExpanded] = useState(false);
  const [unread, setUnread] = useState<number>(0);
  const { searchTerm, setSearchTerm } = useSearch();

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

  const refreshUnread = useCallback(async () => {
    const res = await fetch('/api/messaging/unread/count')
    if (res.ok) {
      const json = await res.json()
      setUnread(json.count || 0)
    }
  }, [])

  useEffect(() => {
    // Initial fetch
    void refreshUnread()
    // Realtime updates
    const channel = supabase.channel('messages-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        void refreshUnread()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members' }, () => {
        void refreshUnread()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [refreshUnread])

  useEffect(() => {
    const handler = () => {
      void refreshUnread()
    }
    window.addEventListener('unread-refresh', handler)
    return () => window.removeEventListener('unread-refresh', handler)
  }, [refreshUnread])

  // Reset stale scroll locks left by Radix Dialog or @uiw/react-md-editor
  // when the user navigates between dashboard sections via client-side routing.
  useEffect(() => {
    document.body.removeAttribute('data-scroll-locked');
    document.body.style.overflow = '';
    document.body.style.pointerEvents = '';
  }, [pathname]);

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
      <SingleSessionGuard />
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
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-meta-card shadow-lg transform transition-transform duration-300 ease-in-out lg:translate-x-0 flex flex-col ${
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
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-hidden">
          <nav className="mt-8 h-full overflow-y-auto pb-24">
            <div className="px-4 space-y-2">
              <Link href="/dashboard">
                <Button variant="ghost" className="w-full justify-start text-meta-light hover:bg-meta-accent hover:text-white">
                  <LayoutDashboard className="h-5 w-5 mr-3" />
                  Competitors
                </Button>
              </Link>

              <Link href="/dashboard/releases">
                <Button variant="ghost" className="w-full justify-start text-meta-light hover:bg-meta-accent hover:text-white">
                  <FileSignature className="h-5 w-5 mr-3" />
                  Release Management
                </Button>
              </Link>

              <Link href="/dashboard/teams">
                <Button variant="ghost" className="w-full justify-start text-meta-light hover:bg-meta-accent hover:text-white">
                  <Users className="h-5 w-5 mr-3" />
                  Teams
                </Button>
              </Link>

              <Link href="/dashboard/game-platform">
                <Button variant="ghost" className="w-full justify-start text-meta-light hover:bg-meta-accent hover:text-white">
                  <Trophy className="h-5 w-5 mr-3" />
                  Game Platform
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

              <Link href="/dashboard/library">
                <Button variant="ghost" className="w-full justify-start text-meta-light hover:bg-meta-accent hover:text-white">
                  <BookOpen className="h-5 w-5 mr-3" />
                  Coach Library
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
                      asChild
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-meta-muted hover:bg-meta-accent hover:text-white text-sm"
                    >
                      <a href="/api/cybernuggets/sso" target="_blank" rel="noopener noreferrer">
                        <span className="flex w-full items-center justify-between">
                          <span>CyberNuggets</span>
                          <ExternalLink className="h-4 w-4" />
                        </span>
                      </a>
                    </Button>
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-meta-muted hover:bg-meta-accent hover:text-white text-sm"
                    >
                      <a href="/api/metactf/sso" target="_blank" rel="noopener noreferrer">
                        <span className="flex w-full items-center justify-between">
                          <span>Goto MetaCTF</span>
                          <ExternalLink className="h-4 w-4" />
                        </span>
                      </a>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </nav>
        </div>

        {/* User Info & Sign Out */}
        <div className="mt-auto p-4 border-t border-meta-border">
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
        <div className="flex min-h-[calc(100vh-1.5rem)] flex-col gap-6 px-6 pt-6 pb-0 overflow-hidden">
          {/* Admin-only: Context switcher renders nothing for non-admins */}
          <AdminContextSwitcher />
          <div className="flex-1 min-h-0">
            {children}
          </div>
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

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SearchProvider>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </SearchProvider>
  );
}
