'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase/client';
import { useAdminCoachContext } from '@/lib/admin/useAdminCoachContext';
import ActingAsBanner from '@/components/admin/ActingAsBanner';
import { Plus, Minus, Users, X, UserPlus, ChevronDown, ChevronRight, Upload, Image as ImageIcon } from 'lucide-react';
import Image from 'next/image';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type DivisionValue = 'middle_school' | 'high_school' | 'college';

interface Competitor {
  id: string;
  first_name: string;
  last_name: string;
  grade?: string;
  status: string;
  is_active: boolean;
  team_id?: string;
  coach_id?: string;
  division?: DivisionValue | null;
}

interface Team {
  id: string;
  name: string;
  division?: DivisionValue | null;
  status: 'forming' | 'active' | 'archived';
  member_count: number;
  image_url?: string;
  coach_id?: string;
  affiliation?: string | null;
}

interface TeamMember {
  id: string;
  competitor_id: string;
  competitor: {
    first_name: string;
    last_name: string;
    grade?: string;
    division?: DivisionValue | null;
  };
}

const formatDivisionLabel = (division?: DivisionValue | null) => {
  switch (division) {
    case 'middle_school':
      return 'Middle School';
    case 'high_school':
      return 'High School';
    case 'college':
      return 'College';
    default:
      return '—';
  }
};

// Draggable Competitor Item
function TeamImage({ teamId, teamName, hasImage, imageKey }: { teamId: string; teamName: string; hasImage: boolean; imageKey?: string }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(hasImage);

  useEffect(() => {
    if (!hasImage) {
      setImageUrl(null);
      setIsLoading(false);
      return;
    }

    const fetchImageUrl = async () => {
      try {
        const { createClientComponentClient } = await import('@supabase/auth-helpers-nextjs');
        const supabase = createClientComponentClient();
        
        // Get the team's image path from the database
        const { data: teamData, error: teamError } = await supabase
          .from('teams')
          .select('image_url')
          .eq('id', teamId)
          .single();

        if (teamError || !teamData?.image_url) {
          console.error('No image path found for team:', teamId);
          setIsLoading(false);
          return;
        }

        // Generate signed URL for private bucket with RLS
        console.log('Generating signed URL for path:', teamData.image_url);
        const { data: signedData, error: signedUrlError } = await supabase.storage
          .from('team-images')
          .createSignedUrl(teamData.image_url, 60 * 60 * 24 * 7); // 7 days

        if (signedUrlError) {
          console.error('Error generating signed URL:', signedUrlError);
        } else {
          const url = signedData?.signedUrl
          console.log('Generated signed URL:', url);
          if (url) setImageUrl(url);
        }
      } catch (error) {
        console.error('Error fetching image URL:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchImageUrl();
  }, [teamId, hasImage, imageKey]);

  if (!hasImage) {
    return (
      <div className="w-24 h-24 rounded bg-meta-dark flex items-center justify-center">
        <ImageIcon className="h-8 w-8 text-meta-muted" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-24 h-24 rounded bg-meta-dark flex items-center justify-center">
        <div className="animate-spin h-4 w-4 border-2 border-meta-muted border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!imageUrl) {
    return (
      <div className="w-24 h-24 rounded bg-meta-dark flex items-center justify-center">
        <ImageIcon className="h-8 w-8 text-meta-muted" />
      </div>
    );
  }

  return (
    <Image
      src={imageUrl}
      alt={`${teamName} team`}
      width={96}
      height={96}
      className="w-24 h-24 rounded object-contain bg-transparent"
      onError={() => {
        console.error('Failed to load team image:', imageUrl);
        setImageUrl(null);
      }}
      unoptimized
    />
  );
}

function DraggableCompetitor({ competitor }: { competitor: Competitor }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: competitor.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="p-3 border border-meta-border rounded-lg bg-meta-card cursor-move hover:border-meta-accent transition-colors"
    >
      <div>
        <p className="font-medium text-meta-light">
          {competitor.first_name} {competitor.last_name}
        </p>
        <div className="flex flex-col text-sm text-meta-muted">
          {competitor.grade ? (
            <span>Grade {competitor.grade}</span>
          ) : null}
          {competitor.division ? (
            <span>
              {competitor.division.replace('_', ' ')}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Droppable Team Card
function DroppableTeamCard({ 
  team, 
  teamMembers, 
  onDeleteTeam, 
  onRemoveMember,
  onImageUpload,
  onRemoveImage,
  disableActions,
  tooltip
}: {
  team: Team;
  teamMembers: TeamMember[];
  onDeleteTeam: (teamId: string) => void;
  onRemoveMember: (teamId: string, competitorId: string) => void;
  onImageUpload: (teamId: string, file: File) => void;
  onRemoveImage: (teamId: string) => void;
  disableActions?: boolean;
  tooltip?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: team.id,
  });
  const [expanded, setExpanded] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImageUploading(true);
      await onImageUpload(team.id, file);
      setImageUploading(false);
      // Reset input to allow re-selecting the same file
      event.target.value = '';
    }
  };

  return (
    <Card 
      ref={setNodeRef}
      className={`bg-meta-card border transition-colors ${
        isOver 
          ? 'border-meta-accent bg-meta-accent/20 border-2' 
          : 'border-meta-border hover:border-meta-accent'
      }`}
    >
      <CardContent className="p-4">
        {/* Team Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="p-1 h-6 w-6"
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>

            {/* Team Image */}
            <div className="relative group">
              <TeamImage teamId={team.id} teamName={team.name} hasImage={!!team.image_url} imageKey={team.image_url || undefined} />

              {/* Upload/Change Overlay */}
              {!team.image_url ? (
                <label className="absolute inset-0 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity" title={disableActions ? (tooltip || 'Select a coach to edit') : 'Upload team image'}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    disabled={imageUploading || !!disableActions}
                  />
                  <div className="w-24 h-24 rounded bg-black/50 flex items-center justify-center">
                    <Upload className="h-6 w-6 text-white" />
                  </div>
                </label>
              ) : (
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-24 h-24 rounded bg-black/70 flex items-center justify-center gap-2">
                    <label className="cursor-pointer" title={disableActions ? (tooltip || 'Select a coach to edit') : 'Change image'}>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                        disabled={imageUploading || !!disableActions}
                      />
                      <Upload className="h-5 w-5 text-white hover:text-blue-300" />
                    </label>
                    <button
                      onClick={() => onRemoveImage(team.id)}
                      disabled={imageUploading || !!disableActions}
                      className="text-white hover:text-red-300 disabled:opacity-50"
                      title={disableActions ? (tooltip || 'Select a coach to edit') : 'Remove image'}
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <h3 className="font-medium text-meta-light">{team.name}</h3>
              <p className="text-sm text-meta-muted flex flex-col leading-tight">
                <span>{team.member_count}/6 members</span>
                <span className="text-xs">Division: {formatDivisionLabel(team.division)}</span>
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onDeleteTeam(team.id)}
            disabled={team.member_count > 0 || !!disableActions}
            className={`text-red-600 border-red-300 hover:bg-red-50 h-6 w-6 p-0 ${
              (team.member_count > 0 || disableActions) ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            title={disableActions ? (tooltip || 'Select a coach to edit') : (team.member_count > 0 ? 'Remove all members first' : 'Delete team')}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>

        {/* Expanded Content */}
        {expanded && (
          <div className="space-y-4 mt-4">
            {/* Team Members */}
            <div>
              <h4 className="text-sm font-medium text-meta-light mb-2">Team Members</h4>
              <div className="space-y-1">
                {teamMembers.length === 0 ? (
                  <p className="text-sm text-meta-muted italic">No members yet</p>
                ) : (
                  teamMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between p-2 bg-meta-dark rounded text-sm">
                      <span className="text-meta-light">
                        {member.competitor.first_name} {member.competitor.last_name}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onRemoveMember(team.id, member.competitor_id)}
                        className="text-red-600 border-red-300 hover:bg-red-50 h-5 w-5 p-0"
                        disabled={!!disableActions}
                        title={disableActions ? (tooltip || 'Select a coach to edit') : 'Remove from team'}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const dynamic = 'force-dynamic';

export default function TeamsPage() {
  const { coachId, loading: ctxLoading } = useAdminCoachContext()
  const [availableCompetitors, setAvailableCompetitors] = useState<Competitor[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamMembers, setTeamMembers] = useState<Record<string, TeamMember[]>>({});
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDivision, setNewTeamDivision] = useState<DivisionValue>('high_school');
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [divisionFilter, setDivisionFilter] = useState<'all' | DivisionValue>('all');
  const [isAdmin, setIsAdmin] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Initial and context-based fetch
  const fetchData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setIsAdmin((profile as any)?.role === 'admin')

      // Fetch all competitors through API route (enables admin access)
      const competitorsResponse = await fetch('/api/competitors');
      if (!competitorsResponse.ok) {
        throw new Error('Failed to fetch competitors');
      }
      const competitorsData = await competitorsResponse.json();

      // Fetch teams through API route (enables admin access)
      const teamsResponse = await fetch('/api/teams');
      if (!teamsResponse.ok) {
        throw new Error('Failed to fetch teams');
      }
      const teamsData = await teamsResponse.json();

      // Fetch team members for all teams
      const membersData: Record<string, TeamMember[]> = {};
      for (const team of teamsData.teams || []) {
        const { data: members, error: membersError } = await supabase
          .from('team_members')
          .select(`
            id,
            competitor_id,
            competitor:competitors(
              first_name,
              last_name,
              grade,
              division
            )
          `)
          .eq('team_id', team.id);

        if (!membersError) {
          membersData[team.id] = (members || []).map(member => ({
            ...member,
            competitor: Array.isArray(member.competitor) ? member.competitor[0] : member.competitor
          }));
        }
      }

      // Filter available competitors: active and not on a team (include all statuses)
      let available = (competitorsData.competitors || []).filter((c: any) => 
        c.is_active && !c.team_id
      ) as Competitor[];
      // Admin with a selected coach: scope available competitors
      if ((profile as any)?.role === 'admin' && coachId) {
        available = available.filter(c => c.coach_id === coachId)
      }

      let teamsWithCounts = (teamsData.teams || []).map((team: any) => ({
        ...team,
        member_count: (membersData[team.id] || []).length
      })) as Team[];
      // Admin with a selected coach: scope teams
      if ((profile as any)?.role === 'admin' && coachId) {
        teamsWithCounts = teamsWithCounts.filter(t => t.coach_id === coachId)
      }

      setAvailableCompetitors(available);
      setTeams(teamsWithCounts);
      setTeamMembers(membersData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [coachId]);

  useEffect(() => {
    if (!ctxLoading) fetchData();
  }, [ctxLoading, fetchData]);

  // Connect sidebar search to teams page
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

  const createTeam = async () => {
    if (!newTeamName.trim()) return;
    if (isAdmin && !ctxLoading && coachId === null) return; // read-only mode

    setIsCreatingTeam(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Optimistic update
    const tempTeam: Team = {
      id: `temp-${Date.now()}`,
      name: newTeamName.trim(),
      division: newTeamDivision,
      status: 'forming',
      member_count: 0
    };

      setTeams(prev => [...prev, tempTeam]);
      setTeamMembers(prev => ({ ...prev, [tempTeam.id]: [] }));

      const response = await fetch('/api/teams/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTeamName.trim(),
          division: newTeamDivision
        }),
      });

      if (response.ok) {
        const { team: newTeam } = await response.json();
        setTeams(prev => prev.map(t => 
          t.id === tempTeam.id
            ? {
                ...newTeam,
                member_count: 0,
                division: (newTeam as Team).division ?? tempTeam.division ?? null,
                status: (newTeam as Team).status ?? 'forming'
              }
            : t
        ));
        setTeamMembers(prev => {
          const newMembers = { ...prev };
          delete newMembers[tempTeam.id];
          newMembers[newTeam.id] = [];
          return newMembers;
        });
        setNewTeamName('');
        setNewTeamDivision('high_school');
      } else {
        // Revert optimistic update
        setTeams(prev => prev.filter(t => t.id !== tempTeam.id));
        setTeamMembers(prev => {
          const newMembers = { ...prev };
          delete newMembers[tempTeam.id];
          return newMembers;
        });
        alert('Failed to create team');
      }
    } catch (error) {
      console.error('Error creating team:', error);
      alert('Failed to create team');
    } finally {
      setIsCreatingTeam(false);
    }
  };

  const addMemberToTeam = async (teamId: string, competitorId: string) => {
    // Optimistic assignment for snappy UX
    if (isAdmin && !ctxLoading && coachId === null) return; // read-only mode
    const comp = availableCompetitors.find(c => c.id === competitorId)
    const team = teams.find(t => t.id === teamId)
    if (isAdmin && coachId && comp && team && (comp.coach_id && team.coach_id) && (comp.coach_id !== team.coach_id)) {
      alert('Competitor does not belong to the selected coach context')
      return
    }

    const prevAvailable = [...availableCompetitors]
    const prevMembers = JSON.parse(JSON.stringify(teamMembers)) as typeof teamMembers
    const prevTeams = [...teams]

    if (team?.division && comp?.division && team.division !== comp.division) {
      const competitorDivisionLabel = formatDivisionLabel(comp.division);
      const teamDivisionLabel = formatDivisionLabel(team.division);
      alert(`Cannot add ${comp?.first_name ?? 'Competitor'} ${comp?.last_name ?? ''} (${competitorDivisionLabel}) to ${team?.name ?? 'team'} (${teamDivisionLabel})`);
      return;
    }

    if (comp) {
      setAvailableCompetitors(prev => prev.filter(c => c.id !== competitorId))
      setTeamMembers(prev => ({
        ...prev,
        [teamId]: [
          ...(prev[teamId] || []),
          {
            id: `temp-${Date.now()}`,
            competitor_id: competitorId,
            competitor: { first_name: comp.first_name, last_name: comp.last_name, grade: comp.grade }
          }
        ]
      }))
      setTeams(prev => prev.map(t => t.id === teamId ? { ...t, member_count: t.member_count + 1 } : t))
    }

    try {
      const response = await fetch(`/api/teams/${teamId}/members/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competitor_id: competitorId }),
      })
      if (!response.ok) {
        let message = 'Failed to add member to team'
        try {
          const data = await response.json()
          if (data?.error) message = data.error
        } catch (parseError) {
          // ignore parse errors
        }
        throw new Error(message)
      }
    } catch (error) {
      // Revert optimistic updates on failure
      console.error('Error adding member to team:', error)
      setAvailableCompetitors(prevAvailable)
      setTeamMembers(prevMembers)
      setTeams(prevTeams)
      alert(error instanceof Error ? error.message : 'Failed to add member to team')
    }
  };

  const removeMemberFromTeam = async (teamId: string, competitorId: string) => {
    try {
      if (isAdmin && !ctxLoading && coachId === null) return; // read-only mode
      const response = await fetch(`/api/teams/${teamId}/members/${competitorId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Optimistic update
        const member = teamMembers[teamId]?.find(m => m.competitor_id === competitorId);
        if (member) {
          const team = teams.find(t => t.id === teamId);
          const division = member.competitor.division ?? team?.division ?? null;
          setAvailableCompetitors(prev => [...prev, {
            id: competitorId,
            first_name: member.competitor.first_name,
            last_name: member.competitor.last_name,
            grade: member.competitor.grade,
            division,
            status: 'profile',
            is_active: true,
            coach_id: coachId || undefined
          }]);
          setTeamMembers(prev => ({
            ...prev,
            [teamId]: prev[teamId].filter(m => m.competitor_id !== competitorId)
          }));
          setTeams(prev => prev.map(team => 
            team.id === teamId 
              ? { ...team, member_count: team.member_count - 1 }
              : team
          ));
        }
      } else {
        alert('Failed to remove member from team');
      }
    } catch (error) {
      console.error('Error removing member from team:', error);
      alert('Failed to remove member from team');
    }
  };

  const deleteTeam = async (teamId: string) => {
    try {
      if (isAdmin && !ctxLoading && coachId === null) return; // read-only mode
      const response = await fetch(`/api/teams/${teamId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Add team members back to available competitors
        const members = teamMembers[teamId] || [];
        setAvailableCompetitors(prev => [
          ...prev,
          ...members.map(member => ({
            id: member.competitor_id,
            first_name: member.competitor.first_name,
            last_name: member.competitor.last_name,
            grade: member.competitor.grade,
            status: 'profile',
            is_active: true,
            coach_id: coachId || undefined
          }))
        ]);
        
        setTeams(prev => prev.filter(team => team.id !== teamId));
        setTeamMembers(prev => {
          const newMembers = { ...prev };
          delete newMembers[teamId];
          return newMembers;
        });
      } else {
        alert('Failed to delete team');
      }
    } catch (error) {
      console.error('Error deleting team:', error);
      alert('Failed to delete team');
    }
  };

  const disableAdminAll = isAdmin && !ctxLoading && coachId === null

  const handleDragStart = (event: DragStartEvent) => {
    if (disableAdminAll) return;
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    if (disableAdminAll) return;
    const { active, over } = event;
    
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Check if we're dragging a competitor over a team
    const isCompetitor = availableCompetitors.some(c => c.id === activeId);
    const isTeam = teams.some(t => t.id === overId);

    if (isCompetitor && isTeam) {
      // Visual feedback is handled by the useDroppable hook
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (disableAdminAll) { setActiveId(null); return; }
    const { active, over } = event;
    
    if (!over) {
      setActiveId(null);
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;

    // Check if we're dropping a competitor onto a team
    const competitor = availableCompetitors.find(c => c.id === activeId);
    const team = teams.find(t => t.id === overId);

    if (competitor && team) {
      if (team.division && competitor.division && team.division !== competitor.division) {
        const competitorDivisionLabel = formatDivisionLabel(competitor.division);
        const teamDivisionLabel = formatDivisionLabel(team.division);
        alert(`Cannot add ${competitor.first_name} ${competitor.last_name} (${competitorDivisionLabel}) to ${team.name} (${teamDivisionLabel})`);
        setActiveId(null);
        return;
      }
      addMemberToTeam(overId, activeId);
    }

    setActiveId(null);
  };

  // Filter available competitors based on division and search term
  const filteredAvailableCompetitors = availableCompetitors.filter((competitor) => {
    // Division filter
    const matchesDivision = divisionFilter === 'all' || competitor.division === divisionFilter;

    // Search filter
    const term = searchTerm.toLowerCase();
    const divisionLabel = competitor.division ? competitor.division.replace('_', ' ') : '';
    const matchesSearch = competitor.first_name.toLowerCase().includes(term) ||
      competitor.last_name.toLowerCase().includes(term) ||
      competitor.grade?.toLowerCase().includes(term) ||
      divisionLabel.toLowerCase().includes(term);

    return matchesDivision && matchesSearch;
  });

  const uploadTeamImage = async (teamId: string, file: File) => {
    try {
      // Create FormData for file upload
      const formData = new FormData();
      formData.append('file', file);

      // Upload using server-side API route
      const response = await fetch(`/api/teams/${teamId}/upload-image`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const { image_url } = await response.json();
        setTeams(prev => prev.map(team =>
          team.id === teamId
            ? { ...team, image_url }
            : team
        ));
      } else {
        const errorData = await response.json();
        alert(`Failed to upload image: ${errorData.error}`);
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Failed to upload image');
    }
  };

  const removeTeamImage = async (teamId: string) => {
    if (!confirm('Remove team image?')) return;

    try {
      const response = await fetch(`/api/teams/${teamId}/upload-image`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setTeams(prev => prev.map(team =>
          team.id === teamId
            ? { ...team, image_url: null }
            : team
        ));
      } else {
        const errorData = await response.json();
        alert(`Failed to remove image: ${errorData.error}`);
      }
    } catch (error) {
      console.error('Error removing image:', error);
      alert('Failed to remove image');
    }
  };

  // Note: Team images are served via Supabase Storage with RLS.
  // We no longer refresh signed URLs; the stored `image_url` is used directly.

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-96 bg-gray-200 rounded"></div>
            <div className="h-96 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-meta-light">Teams</h1>
          <p className="text-meta-muted mt-2">
            Manage teams and assign competitors
          </p>
          <ActingAsBanner />
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Available Competitors */}
          <Card className="bg-meta-card border-meta-border">
            <CardHeader>
              <CardTitle className="text-meta-light text-lg">Available Competitors</CardTitle>
              <CardDescription className="text-meta-muted">
                Drag to teams ({filteredAvailableCompetitors.length})
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Division Filter */}
              {(() => {
                const counts = {
                  all: availableCompetitors.length,
                  middle_school: availableCompetitors.filter(c => c.division === 'middle_school').length,
                  high_school: availableCompetitors.filter(c => c.division === 'high_school').length,
                  college: availableCompetitors.filter(c => c.division === 'college').length,
                };

                const tabs: Array<{value: 'all' | DivisionValue; label: string}> = [
                  { value: 'all', label: `All (${counts.all})` },
                  ...(counts.middle_school > 0 ? [{ value: 'middle_school' as DivisionValue, label: `Middle (${counts.middle_school})` }] : []),
                  ...(counts.high_school > 0 ? [{ value: 'high_school' as DivisionValue, label: `High (${counts.high_school})` }] : []),
                  ...(counts.college > 0 ? [{ value: 'college' as DivisionValue, label: `College (${counts.college})` }] : []),
                ];

                return (
                  <div className="mb-4">
                    <div className="text-sm text-meta-light mb-2">Division:</div>
                    <div className="flex rounded-md overflow-hidden border border-meta-border">
                      {tabs.map(tab => (
                        <button
                          key={tab.value}
                          onClick={() => setDivisionFilter(tab.value)}
                          className={`px-3 py-1 ${divisionFilter === tab.value ? 'bg-meta-accent text-white' : 'bg-meta-card text-meta-light hover:bg-meta-dark'}`}
                          title={`Show ${tab.label}`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
              
              <SortableContext
                items={filteredAvailableCompetitors.map(c => c.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {filteredAvailableCompetitors.length === 0 ? (
                    <div className="text-center py-8 text-meta-muted">
                      <Users className="mx-auto h-8 w-8 mb-2" />
                      <p>
                        {searchTerm ? 'No competitors match your search' : 'All competitors are assigned to teams'}
                      </p>
                    </div>
                  ) : (
                    filteredAvailableCompetitors.map((competitor) => (
                      <DraggableCompetitor key={competitor.id} competitor={competitor} />
                    ))
                  )}
                </div>
              </SortableContext>
            </CardContent>
          </Card>

          {/* Teams */}
          <Card className="bg-meta-card border-meta-border lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-meta-light text-lg">Teams</CardTitle>
              <CardDescription className="text-meta-muted">
                Current teams ({teams.length})
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Create New Team */}
              <div className="mb-4 p-3 border border-meta-border rounded-lg">
              <div className="flex items-center space-x-2">
                <Input
                  placeholder="Enter team name"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  className="flex-1 bg-meta-dark border-meta-border text-meta-light"
                  onKeyPress={(e) => e.key === 'Enter' && createTeam()}
                />
                <select
                  value={newTeamDivision}
                  onChange={(e) => setNewTeamDivision(e.target.value as DivisionValue)}
                  className="bg-meta-dark border border-meta-border text-meta-light text-sm rounded px-2 py-2"
                  aria-label="Team division"
                  disabled={isCreatingTeam || disableAdminAll}
                >
                  <option value="middle_school">Middle School</option>
                  <option value="high_school">High School</option>
                  <option value="college">College</option>
                </select>
                <Button
                  onClick={createTeam}
                  disabled={!newTeamName.trim() || isCreatingTeam || disableAdminAll}
                  size="sm"
                  className="bg-meta-accent hover:bg-blue-600"
                    title={disableAdminAll ? 'Select a coach to edit' : 'Create new team'}
                  >
                    {isCreatingTeam ? 'Creating...' : <Plus className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Teams List */}
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {teams.length === 0 ? (
                  <div className="text-center py-8 text-meta-muted">
                    <Users className="mx-auto h-8 w-8 mb-2" />
                    <p>No teams created yet</p>
                    <p className="text-xs">Create your first team above</p>
                  </div>
                ) : (
                  teams.map((team) => (
                    <DroppableTeamCard
                      key={team.id}
                      team={team}
                      teamMembers={teamMembers[team.id] || []}
                      onDeleteTeam={deleteTeam}
                      onRemoveMember={removeMemberFromTeam}
                      onImageUpload={uploadTeamImage}
                      onRemoveImage={removeTeamImage}
                      disableActions={disableAdminAll}
                      tooltip="Select a coach to edit"
                    />
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeId ? (
          <div className="p-3 border border-meta-accent rounded-lg bg-meta-card shadow-lg">
            <p className="text-meta-light font-medium">
              {availableCompetitors.find(c => c.id === activeId)?.first_name} {availableCompetitors.find(c => c.id === activeId)?.last_name}
            </p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
