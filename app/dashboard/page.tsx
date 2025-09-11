'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';
import { CompetitorForm } from '@/components/dashboard/competitor-form';
import { CompetitorEditForm } from '@/components/dashboard/competitor-edit-form';
import { Edit, UserCheck, Gamepad2, Ban, LogIn, Link as LinkIcon, ChevronDown } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { createCompetitorColumns, Competitor as CompetitorType } from '@/components/dashboard/competitor-columns';

interface Competitor {
  id: string;
  first_name: string;
  last_name: string;
  email_personal?: string;
  email_school?: string;
  is_18_or_over?: boolean;
  grade?: string;
  division?: 'middle_school' | 'high_school' | 'college' | null;
  status: string;
  media_release_signed: boolean;
  media_release_date?: string;
  participation_agreement_signed: boolean;
  participation_agreement_date?: string;
  game_platform_id?: string;
  game_platform_synced_at?: string;
  team_id?: string;
  team_name?: string;
  team_position?: number;
  profile_update_token?: string;
  profile_update_token_expires?: string;
  created_at: string;
  is_active: boolean;
}

interface DashboardStats {
  totalCompetitors: number;
  totalTeams: number;
  activeCompetitors: number;
  pendingCompetitors: number;
}

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalCompetitors: 0,
    totalTeams: 0,
    activeCompetitors: 0,
    pendingCompetitors: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingCompetitor, setEditingCompetitor] = useState<Competitor | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [teams, setTeams] = useState<Array<{id: string, name: string, memberCount?: number}>>([]);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [coachProfile, setCoachProfile] = useState<any>(null);
  const [divisionFilter, setDivisionFilter] = useState<'all' | 'middle_school' | 'high_school' | 'college'>('all');

  const fetchData = async () => {
    try {
      const { data: { session: sessionData } } = await supabase.auth.getSession();
      if (!sessionData) {
        console.error('No session found');
        return;
      }
      setSession(sessionData);
      
      // Fetch coach profile
      if (sessionData?.user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', sessionData.user.id)
          .single();
        
        setCoachProfile(profileData);
      }

      // Fetch competitors through API route (enables admin access control)
      const competitorsResponse = await fetch('/api/competitors');
      if (!competitorsResponse.ok) {
        throw new Error('Failed to fetch competitors');
      }
      const competitorsData = await competitorsResponse.json();
      
      // Transform data to include status fields
      const transformedCompetitors = (competitorsData.competitors || []).map((comp: any) => ({
        ...comp,
        media_release_signed: comp.media_release_signed || false,
        participation_agreement_signed: comp.participation_agreement_signed || false,
        is_active: comp.is_active !== undefined ? comp.is_active : true, // Default to true if not set
      }));

      setCompetitors(transformedCompetitors);

      // Fetch teams for dropdown - also through API for admin access
      const teamsResponse = await fetch('/api/teams');
      if (!teamsResponse.ok) {
        throw new Error('Failed to fetch teams');
      }
      const teamsData = await teamsResponse.json();
      
      // Fetch team member counts separately
      const teamMemberCounts = new Map<string, number>();
      for (const team of teamsData.teams || []) {
        const { count } = await supabase
          .from('team_members')
          .select('*', { count: 'exact', head: true })
          .eq('team_id', team.id);
        teamMemberCounts.set(team.id, count || 0);
      }
      
      // Transform teams data to include member count
      const transformedTeams = (teamsData.teams || []).map((team: any) => ({
        id: team.id,
        name: team.name,
        memberCount: teamMemberCounts.get(team.id) || 0
      }));
      
      setTeams(transformedTeams);

      // Calculate stats
      const totalCompetitors = transformedCompetitors.length;
      const activeCompetitors = transformedCompetitors.filter(c => c.status === 'complete').length;
      const pendingCompetitors = transformedCompetitors.filter(c => c.status === 'pending').length;

      // Use teams count from API response
      setStats({
        totalCompetitors,
        totalTeams: teamsData.teams?.length || 0,
        activeCompetitors,
        pendingCompetitors
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchData();
    });

    return () => subscription.unsubscribe();
  }, []);

  // Connect sidebar search to dashboard search
  useEffect(() => {
    const sidebarSearch = document.getElementById('sidebar-search') as HTMLInputElement;
    if (sidebarSearch) {
      const handleSidebarSearch = (e: Event) => {
        const target = e.target as HTMLInputElement;
        setSearchTerm(target.value);
      };
      
      sidebarSearch.addEventListener('input', handleSidebarSearch);
      return () => sidebarSearch.removeEventListener('input', handleSidebarSearch);
    }
  }, []);

  // Filter competitors
  const filteredCompetitors = competitors.filter(competitor => {
    const matchesSearch = competitor.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         competitor.last_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesActiveFilter = showInactive || competitor.is_active;
    const matchesDivision = divisionFilter === 'all' || competitor.division === divisionFilter;
    return matchesSearch && matchesActiveFilter && matchesDivision;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete':
        return 'bg-green-100 text-green-800';
      case 'compliance':
        return 'bg-purple-100 text-purple-800';
      case 'profile':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleEdit = (competitorId: string) => {
    const competitor = competitors.find(c => c.id === competitorId);
    if (competitor) {
      setEditingCompetitor(competitor);
      setEditModalOpen(true);
    }
  };

  const handleRegenerateLink = async (competitorId: string): Promise<string | null> => {
    try {
      const response = await fetch(`/api/competitors/${competitorId}/regenerate-link`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to regenerate link');
      }

      const data = await response.json();
      
      // Refresh data to get updated token info
      fetchData();
      
      // Return the new profile update URL
      return data.profileUpdateUrl;
    } catch (error: any) {
      console.error('Error regenerating link:', error);
      alert('Failed to regenerate profile link: ' + error.message);
      return null;
    }
  };

  const handleRegister = (competitorId: string) => {
    // TODO: Implement registration functionality
    console.log('Register competitor:', competitorId);
  };

  const handleDisable = async (competitorId: string) => {
    try {
      const competitor = competitors.find(c => c.id === competitorId);
      if (!competitor) return;

      const newActiveState = !competitor.is_active;
      
      // Optimistic update
      setCompetitors(prev => prev.map(c => 
        c.id === competitorId 
          ? { ...c, is_active: newActiveState }
          : c
      ));

      // API call to update database
      const response = await fetch(`/api/competitors/${competitorId}/toggle-active`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newActiveState }),
      });

      if (!response.ok) {
        // Revert on error
        setCompetitors(prev => prev.map(c => 
          c.id === competitorId 
            ? { ...c, is_active: !newActiveState }
            : c
        ));
        throw new Error('Failed to update competitor status');
      }
    } catch (error: any) {
      console.error('Error toggling competitor status:', error);
      alert('Failed to update competitor status: ' + error.message);
    }
  };



  const assignTeam = async (competitorId: string, teamId: string | undefined) => {
    try {
      if (teamId) {
        const response = await fetch(`/api/teams/${teamId}/members/add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            competitor_id: competitorId,
          }),
        });

        if (response.ok) {
          // Refresh data to get updated team information
          fetchData();
        } else {
          const errorData = await response.json();
          alert('Failed to assign team: ' + errorData.error);
        }
      } else {
        // Remove from team
        const competitor = competitors.find(c => c.id === competitorId);
        if (competitor?.team_id) {
          const response = await fetch(`/api/teams/${competitor.team_id}/members/${competitorId}`, {
            method: 'DELETE',
          });

          if (response.ok) {
            // Refresh data to get updated team information
            fetchData();
          } else {
            alert('Failed to remove from team');
          }
        }
      }
      
      setOpenDropdown(null);
    } catch (error) {
      console.error('Error assigning team:', error);
      alert('Failed to assign team');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white-900">Dashboard Overview</h1>
        <p className="text-gray-600 mt-2">
          Manage your competitors and track their progress
        </p>
      </div>

      {/* Stats Grid with Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-meta-card border-meta-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-meta-light">Total Competitors</CardTitle>
            {/* Add competitor (tooltip) */}
            <div title="Create new competitor">
              <CompetitorForm onSuccess={fetchData} variant="compact" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-meta-light">{stats.totalCompetitors}</div>
            <p className="text-xs text-meta-muted">
              All competitors in your program
            </p>
          </CardContent>
        </Card>

        <Card className="bg-meta-card border-meta-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-meta-light">Complete</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-400">{stats.activeCompetitors}</div>
            <p className="text-xs text-meta-muted">
              Game platform integrated
            </p>
          </CardContent>
        </Card>

        <Card className="bg-meta-card border-meta-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-meta-light">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-400">{stats.pendingCompetitors}</div>
            <p className="text-xs text-meta-muted">
              Coach initiated record
            </p>
          </CardContent>
        </Card>

        <Card className="bg-meta-card border-meta-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-meta-light">Total Teams</CardTitle>
            <Link href="/dashboard/teams" title="Open team management">
              <Button size="sm" className="h-8 w-8 p-0 bg-meta-accent hover:bg-blue-600" aria-label="Open team management">
                <LogIn className="h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-meta-light">{stats.totalTeams}</div>
            <p className="text-xs text-meta-muted">
              Teams you've created
            </p>
          </CardContent>
        </Card>
      </div>



      {/* Competitors List */}
      <Card className="bg-meta-card border-meta-border">
        <CardHeader>
          <CardTitle className="text-meta-light">
            All Competitors ({filteredCompetitors.length})
          </CardTitle>
          <CardDescription className="text-meta-muted">
            {competitors.length === 0 
              ? 'No competitors added yet. Add your first competitor to get started!'
              : 'View and manage all competitors in your program'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Controls */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-2 text-sm text-meta-light">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="rounded border-meta-border bg-meta-card text-meta-accent focus:ring-meta-accent"
                />
                <span>Show Inactive Competitors</span>
              </label>
              {/* Division filter as simple tabs */}
              {(() => {
                const present = new Set((competitors || []).filter(c => c.is_active).map(c => c.division).filter(Boolean) as string[])
                const order: Array<{value: any; label: string}> = [
                  { value: 'all', label: 'All' },
                  ...(present.has('middle_school') ? [{ value: 'middle_school', label: 'Middle' }] : []),
                  ...(present.has('high_school') ? [{ value: 'high_school', label: 'High' }] : []),
                  ...(present.has('college') ? [{ value: 'college', label: 'College' }] : []),
                ]
                return (
                  <div className="flex items-center text-sm">
                    <span className="mr-2 text-meta-light">Division:</span>
                    <div className="flex rounded-md overflow-hidden border border-meta-border">
                      {order.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setDivisionFilter(opt.value as any)}
                          className={`px-3 py-1 ${divisionFilter === opt.value ? 'bg-meta-accent text-white' : 'bg-meta-card text-meta-light hover:bg-meta-dark'}`}
                          title={`Show ${opt.label} division`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>
            <div className="text-sm text-meta-muted">
              Showing {filteredCompetitors.length} of {competitors.length} competitors
            </div>
          </div>

          {/* Data Table */}
          <DataTable
            columns={createCompetitorColumns(
              handleEdit,
              handleRegenerateLink,
              handleRegister,
              handleDisable,
              assignTeam,
              teams,
              openDropdown,
              setOpenDropdown,
              session?.user?.email,
              coachProfile ? `${coachProfile.first_name} ${coachProfile.last_name}` : session?.user?.email
            )}
            data={filteredCompetitors}
          />
        </CardContent>
      </Card>

      {/* Edit Competitor Modal */}
      {editingCompetitor && (
        <CompetitorEditForm
          competitor={editingCompetitor}
          open={editModalOpen}
          onOpenChange={setEditModalOpen}
          onSuccess={() => {
            fetchData();
            setEditingCompetitor(null);
          }}
        />
      )}


    </div>
  );
}
