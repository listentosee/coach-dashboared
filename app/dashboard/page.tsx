'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';
import { CompetitorForm } from '@/components/dashboard/competitor-form';
import { CompetitorEditForm } from '@/components/dashboard/competitor-edit-form';
import { Edit, UserCheck, Gamepad2, Ban, Plus, Link as LinkIcon, ChevronDown } from 'lucide-react';

interface Competitor {
  id: string;
  first_name: string;
  last_name: string;
  email_personal?: string;
  email_school?: string;
  is_18_or_over?: boolean;
  grade?: string;
  status: 'pending' | 'profile updated' | 'complete';
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
  const [regeneratedLink, setRegeneratedLink] = useState<string | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [teams, setTeams] = useState<Array<{id: string, name: string}>>([]);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('No session found');
        return;
      }

      // Fetch competitors with team data using the view
      const { data: competitorsData, error: competitorsError } = await supabase
        .from('comp_team_view')
        .select('*')
        .order('created_at', { ascending: false });

      if (competitorsError) throw competitorsError;

      // Transform data to include status fields
      const transformedCompetitors = (competitorsData || []).map(comp => ({
        ...comp,
        media_release_signed: comp.media_release_signed || false,
        participation_agreement_signed: comp.participation_agreement_signed || false,
        is_active: comp.is_active !== undefined ? comp.is_active : true, // Default to true if not set
      }));

      setCompetitors(transformedCompetitors);

      // Fetch teams for dropdown
      const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select('id, name')
        .eq('coach_id', session.user.id)
        .order('name', { ascending: true });

      if (teamsError) throw teamsError;
      setTeams(teamsData || []);

      // Calculate stats
      const totalCompetitors = transformedCompetitors.length;
      const activeCompetitors = transformedCompetitors.filter(c => c.status === 'complete').length;
      const pendingCompetitors = transformedCompetitors.filter(c => c.status === 'pending').length;

      // Fetch teams count
      const { count: teamsCount } = await supabase
        .from('teams')
        .select('*', { count: 'exact', head: true })
        .eq('coach_id', session.user.id);

      setStats({
        totalCompetitors,
        totalTeams: teamsCount || 0,
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

  const filteredCompetitors = competitors.filter(competitor =>
    competitor.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    competitor.last_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete':
        return 'bg-green-100 text-green-800';
      case 'profile updated':
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

  const handleRegenerateLink = async (competitorId: string) => {
    try {
      const response = await fetch(`/api/competitors/${competitorId}/regenerate-link`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to regenerate link');
      }

      const data = await response.json();
      
      // Show the new link in a modal
      setRegeneratedLink(data.profileUpdateUrl);
      setShowLinkModal(true);
      
      // Refresh data to get updated token info
      fetchData();
    } catch (error: any) {
      console.error('Error regenerating link:', error);
      alert('Failed to regenerate profile link: ' + error.message);
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
        // Find next available position
        const currentMembers = competitors
          .filter(c => c.team_id === teamId)
          .map(c => c.team_position || 0);
        const nextPosition = [1, 2, 3, 4, 5, 6].find(p => !currentMembers.includes(p)) || 1;
        
        const response = await fetch(`/api/teams/${teamId}/members/add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            competitor_id: competitorId,
            position: nextPosition,
          }),
        });

        if (response.ok) {
          // Optimistic update
          setCompetitors(prev => prev.map(c => 
            c.id === competitorId 
              ? { ...c, team_id: teamId, team_name: teams.find(t => t.id === teamId)?.name || '', team_position: nextPosition }
              : c
          ));
        }
      } else {
        // Remove from team
        const competitor = competitors.find(c => c.id === competitorId);
        if (competitor?.team_id) {
          const response = await fetch(`/api/teams/${competitor.team_id}/members/${competitorId}`, {
            method: 'DELETE',
          });

          if (response.ok) {
                      // Optimistic update
          setCompetitors(prev => prev.map(c => 
            c.id === competitorId 
              ? { ...c, team_id: undefined, team_name: undefined, team_position: undefined }
              : c
          ));
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
            <CompetitorForm onSuccess={fetchData} variant="compact" />
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
            <CardTitle className="text-sm font-medium text-meta-light">Active Competitors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-400">{stats.activeCompetitors}</div>
            <p className="text-xs text-meta-muted">
              Currently active participants
            </p>
          </CardContent>
        </Card>

        <Card className="bg-meta-card border-meta-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-meta-light">Pending Approval</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-400">{stats.pendingCompetitors}</div>
            <p className="text-xs text-meta-muted">
              Awaiting profile completion
            </p>
          </CardContent>
        </Card>

        <Card className="bg-meta-card border-meta-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-meta-light">Total Teams</CardTitle>
            <Link href="/dashboard/teams">
              <Button size="sm" className="h-8 w-8 p-0 bg-meta-accent hover:bg-blue-600">
                <Plus className="h-4 w-4" />
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
          {filteredCompetitors.length === 0 ? (
            <div className="text-center py-8 text-meta-muted">
              {searchTerm ? 'No competitors found matching your search.' : 'No competitors added yet.'}
            </div>
          ) : (
            <div className="space-y-0">
              {filteredCompetitors.map((competitor) => (
                <div
                  key={competitor.id}
                  className={`flex items-center justify-between p-2 border border-meta-border rounded-lg hover:bg-meta-dark transition-colors ${!competitor.is_active ? 'opacity-50' : ''}`}
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <div>
                        <h3 className="font-medium text-meta-light">
                          {competitor.first_name} {competitor.last_name}
                        </h3>
                        <div className="flex items-center space-x-4 text-sm text-meta-muted">
                          {competitor.grade && (
                            <span>Grade: {competitor.grade}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-4 pr-5">
                    {/* Status Indicators */}
                    <div className="flex items-center space-x-2">
                      {/* Only show Media Release for competitors under 18 */}
                      {!competitor.is_18_or_over && (
                        <div className={`px-2 py-1 text-xs font-medium rounded ${competitor.media_release_date ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
                          Media Release
                        </div>
                      )}
                      <div className={`px-2 py-1 text-xs font-medium rounded ${competitor.participation_agreement_date ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
                        Agreement
                      </div>
                      <div className={`px-2 py-1 text-xs font-medium rounded ${competitor.game_platform_synced_at ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
                        Game Platform
                      </div>
                      <div className="relative">
                        <button
                          onClick={() => setOpenDropdown(openDropdown === competitor.id ? null : competitor.id)}
                          className="px-2 py-1 text-xs font-medium rounded bg-meta-accent text-white cursor-pointer hover:bg-blue-600 transition-colors flex items-center space-x-1"
                        >
                          <span>{competitor.team_name || 'No Team'}</span>
                          <ChevronDown className="h-3 w-3" />
                        </button>
                        
                        {openDropdown === competitor.id && (
                          <div className="absolute top-full left-0 mt-1 bg-meta-card border border-meta-border rounded-lg shadow-lg z-10 min-w-32">
                            <div className="py-1">
                              <button
                                onClick={() => assignTeam(competitor.id, undefined)}
                                className="w-full text-left px-3 py-2 text-sm text-meta-light hover:bg-meta-accent hover:text-white"
                              >
                                No Team
                              </button>
                              {teams.map((team) => (
                                <button
                                  key={team.id}
                                  onClick={() => assignTeam(competitor.id, team.id)}
                                  className="w-full text-left px-3 py-2 text-sm text-meta-light hover:bg-meta-accent hover:text-white"
                                >
                                  {team.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(competitor.status)}`}>
                      {competitor.status}
                    </span>
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => handleEdit(competitor.id)}
                      title="Edit Competitor"
                      className="text-meta-light hover:text-meta-accent p-1"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleRegenerateLink(competitor.id)}
                      title="Regenerate Profile Link"
                      className="text-meta-light hover:text-meta-accent p-1"
                    >
                      <LinkIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleRegister(competitor.id)}
                      title="Register on Game Platform"
                      className="text-meta-light hover:text-meta-accent p-1"
                    >
                      <Gamepad2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDisable(competitor.id)}
                      title={competitor.is_active ? "Disable Competitor" : "Enable Competitor"}
                      className={`p-1 ${competitor.is_active ? 'text-meta-light hover:text-meta-accent' : 'text-red-500 hover:text-red-600'}`}
                    >
                      {competitor.is_active ? <Ban className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
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

      {/* Regenerated Link Modal */}
      {showLinkModal && regeneratedLink && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-lg p-6 max-w-md w-full mx-4 border border-blue-200">
            <h3 className="text-lg font-semibold mb-4 text-gray-900">Profile Link Regenerated</h3>
            <p className="text-sm text-gray-700 mb-4">
              A new profile update link has been generated for this competitor. The previous link is no longer valid.
            </p>
            <div className="bg-white p-3 rounded border border-gray-300 mb-4">
              <p className="text-xs text-gray-600 mb-2">New Profile Update Link:</p>
              <p className="text-sm font-mono break-all text-gray-900">{regeneratedLink}</p>
            </div>
            <p className="text-xs text-gray-600 mb-4">
              This link will expire in 30 days. Share it with the competitor to allow them to update their profile.
            </p>
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowLinkModal(false);
                  setRegeneratedLink(null);
                }}
                className="border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Close
              </Button>
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(regeneratedLink);
                  alert('Link copied to clipboard!');
                }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Copy Link
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
