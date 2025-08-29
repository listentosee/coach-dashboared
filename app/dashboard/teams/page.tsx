'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase/client';
import { Plus, Minus, Users, X, UserPlus } from 'lucide-react';
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

interface Competitor {
  id: string;
  first_name: string;
  last_name: string;
  grade?: string;
  team_id?: string;
}

interface Team {
  id: string;
  name: string;
  division?: string;
  status: 'forming' | 'active' | 'archived';
  member_count: number;
}

interface TeamMember {
  id: string;
  competitor_id: string;
  position: number;
  competitor: {
    first_name: string;
    last_name: string;
    grade?: string;
  };
}

// Draggable Competitor Item
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
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-meta-light">
            {competitor.first_name} {competitor.last_name}
          </p>
          {competitor.grade && (
            <p className="text-sm text-meta-muted">Grade {competitor.grade}</p>
          )}
        </div>
        <Badge variant="outline" className="border-meta-border text-meta-muted">
          Available
        </Badge>
      </div>
    </div>
  );
}

// Droppable Team Component
function DroppableTeam({ team, teamMembers, onDeleteTeam, onRemoveMember, allCollapsed }: { 
  team: Team; 
  teamMembers: TeamMember[];
  onDeleteTeam: (teamId: string) => void;
  onRemoveMember: (teamId: string, competitorId: string) => void;
  allCollapsed: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: team.id,
  });
  
  const [collapsed, setCollapsed] = useState(allCollapsed);

  // Update collapsed state when allCollapsed changes
  useEffect(() => {
    setCollapsed(allCollapsed);
  }, [allCollapsed]);

  return (
    <div
      ref={setNodeRef}
      className={`p-3 border rounded-lg transition-colors ${
        isOver 
          ? 'border-meta-accent bg-meta-accent/20 border-2' 
          : 'border-meta-border hover:border-meta-accent'
      }`}
      data-team-id={team.id}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-meta-accent hover:text-meta-light transition-colors"
          >
            {collapsed ? '▶' : '▼'}
          </button>
          <h3 className="font-medium text-meta-light">{team.name}</h3>
          <Badge className="bg-meta-accent text-white">
            {team.member_count}/6
          </Badge>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onDeleteTeam(team.id)}
          className="text-red-600 border-red-300 hover:bg-red-50 h-6 w-6 p-0"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* Team Members - Collapsible */}
      {!collapsed && (
        <div className="space-y-1">
          {teamMembers.map((member) => (
            <div key={member.id} className="flex items-center justify-between p-2 bg-meta-dark rounded text-sm">
              <div className="flex items-center space-x-2">
                <span className="w-5 h-5 bg-meta-accent text-white rounded-full flex items-center justify-center text-xs">
                  {member.position}
                </span>
                <span className="text-meta-light">
                  {member.competitor.first_name} {member.competitor.last_name}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onRemoveMember(team.id, member.competitor_id)}
                className="text-red-600 border-red-300 hover:bg-red-50 h-5 w-5 p-0"
              >
                <Minus className="h-3 w-3" />
              </Button>
            </div>
          ))}
          
          {/* Drop Zone Indicator */}
          {isOver && (
            <div className="p-2 bg-meta-accent/20 border border-meta-accent rounded text-center text-meta-accent text-sm">
              Drop here to add student
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const dynamic = 'force-dynamic';

export default function TeamsPage() {
  const [unassignedCompetitors, setUnassignedCompetitors] = useState<Competitor[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamMembers, setTeamMembers] = useState<Record<string, TeamMember[]>>({});
  const [newTeamName, setNewTeamName] = useState('');
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [allCollapsed, setAllCollapsed] = useState(true);
  const [competitorSearchTerm, setCompetitorSearchTerm] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Filter competitors based on search term
  const filteredUnassignedCompetitors = unassignedCompetitors.filter(competitor => {
    const fullName = `${competitor.first_name} ${competitor.last_name}`.toLowerCase();
    const searchLower = competitorSearchTerm.toLowerCase();
    return fullName.includes(searchLower);
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

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
            position,
            competitor:competitors(
              first_name,
              last_name,
              grade
            )
          `)
          .eq('team_id', team.id)
          .order('position', { ascending: true });

        if (!membersError) {
          membersData[team.id] = (members || []).map(member => ({
            ...member,
            competitor: Array.isArray(member.competitor) ? member.competitor[0] : member.competitor
          }));
        }
      }

      // Separate unassigned competitors
      const assignedCompetitorIds = new Set();
      Object.values(membersData).forEach(members => {
        members.forEach(member => assignedCompetitorIds.add(member.competitor_id));
      });

      const unassigned = (competitorsData.competitors || []).filter(c => !assignedCompetitorIds.has(c.id));
      const teamsWithCounts = (teamsData.teams || []).map(team => ({
        ...team,
        member_count: (membersData[team.id] || []).length
      }));

      setUnassignedCompetitors(unassigned);
      setTeams(teamsWithCounts);
      setTeamMembers(membersData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createTeam = async () => {
    if (!newTeamName.trim()) return;

    setIsCreatingTeam(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Optimistic update - immediately update UI
      const tempTeam: Team = {
        id: `temp-${Date.now()}`,
        name: newTeamName.trim(),
        status: 'forming',
        member_count: 0
      };

      setTeams(prev => [tempTeam, ...prev]);
      setTeamMembers(prev => ({ ...prev, [tempTeam.id]: [] }));
      setNewTeamName('');

      // Make API call in background
      const response = await fetch('/api/teams/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tempTeam.name,
        }),
      });

      if (response.ok) {
        // Update with real team ID from API response
        const { team: newTeam } = await response.json();
        setTeams(prev => prev.map(t => 
          t.id === tempTeam.id ? { ...newTeam, member_count: 0 } : t
        ));
        setTeamMembers(prev => {
          const newMembers = { ...prev };
          newMembers[newTeam.id] = [];
          delete newMembers[tempTeam.id];
          return newMembers;
        });
      } else {
        // Revert optimistic update on error
        const errorData = await response.json();
        alert('Failed to create team: ' + errorData.error);
        
        setTeams(prev => prev.filter(t => t.id !== tempTeam.id));
        setTeamMembers(prev => {
          const newMembers = { ...prev };
          delete newMembers[tempTeam.id];
          return newMembers;
        });
        setNewTeamName(tempTeam.name);
      }
    } catch (error) {
      console.error('Error creating team:', error);
      alert('Failed to create team');
      
      // Revert optimistic update on error
      setTeams(prev => prev.filter(t => t.id.startsWith('temp-')));
      setTeamMembers(prev => {
        const newMembers = { ...prev };
        Object.keys(newMembers).forEach(key => {
          if (key.startsWith('temp-')) delete newMembers[key];
        });
        return newMembers;
      });
      setNewTeamName(newTeamName);
    } finally {
      setIsCreatingTeam(false);
    }
  };

  const addMemberToTeam = async (competitorId: string, teamId: string) => {
    try {
      // Find next available position
      const currentMembers = teamMembers[teamId] || [];
      const takenPositions = currentMembers.map(m => m.position);
      const nextPosition = [1, 2, 3, 4, 5, 6].find(p => !takenPositions.includes(p));
      
      if (!nextPosition) {
        alert('Team is at maximum capacity (6 members)');
        return;
      }

      // Optimistic update - immediately update UI
      const competitor = unassignedCompetitors.find(c => c.id === competitorId);
      if (!competitor) return;

      const newMember: TeamMember = {
        id: `temp-${Date.now()}`, // Temporary ID
        competitor_id: competitorId,
        position: nextPosition,
        competitor: competitor
      };

      // Update state immediately
      setUnassignedCompetitors(prev => prev.filter(c => c.id !== competitorId));
      setTeamMembers(prev => ({
        ...prev,
        [teamId]: [...(prev[teamId] || []), newMember]
      }));
      setTeams(prev => prev.map(team => 
        team.id === teamId 
          ? { ...team, member_count: team.member_count + 1 }
          : team
      ));

      // Make API call in background
      const response = await fetch(`/api/teams/${teamId}/members/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competitor_id: competitorId,
          position: nextPosition,
        }),
      });

      if (!response.ok) {
        // Revert optimistic update on error
        const errorData = await response.json();
        alert('Failed to add member: ' + errorData.error);
        
        setUnassignedCompetitors(prev => [...prev, competitor]);
        setTeamMembers(prev => ({
          ...prev,
          [teamId]: (prev[teamId] || []).filter(m => m.id !== newMember.id)
        }));
        setTeams(prev => prev.map(team => 
          team.id === teamId 
            ? { ...team, member_count: team.member_count - 1 }
            : team
        ));
      }
    } catch (error) {
      console.error('Error adding member:', error);
      alert('Failed to add member');
      
      // Revert optimistic update on error
      const competitor = unassignedCompetitors.find(c => c.id === competitorId);
      if (competitor) {
        setUnassignedCompetitors(prev => [...prev, competitor]);
        setTeamMembers(prev => ({
          ...prev,
          [teamId]: (prev[teamId] || []).filter(m => m.competitor_id !== competitorId)
        }));
        setTeams(prev => prev.map(team => 
          team.id === teamId 
            ? { ...team, member_count: team.member_count - 1 }
            : team
        ));
      }
    }
  };

  const removeMemberFromTeam = async (teamId: string, competitorId: string) => {
    try {
      // Find the member and competitor for optimistic update
      const member = teamMembers[teamId]?.find(m => m.competitor_id === competitorId);
      const competitor = member?.competitor;
      
      if (!member || !competitor) return;

      // Optimistic update - immediately update UI
      setTeamMembers(prev => ({
        ...prev,
        [teamId]: (prev[teamId] || []).filter(m => m.competitor_id !== competitorId)
      }));
      setTeams(prev => prev.map(team => 
        team.id === teamId 
          ? { ...team, member_count: team.member_count - 1 }
          : team
      ));
      setUnassignedCompetitors(prev => [...prev, {
        id: competitorId,
        first_name: competitor.first_name,
        last_name: competitor.last_name,
        grade: competitor.grade
      }]);

      // Make API call in background
      const response = await fetch(`/api/teams/${teamId}/members/${competitorId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        // Revert optimistic update on error
        alert('Failed to remove member');
        
        setTeamMembers(prev => ({
          ...prev,
          [teamId]: [...(prev[teamId] || []), member]
        }));
        setTeams(prev => prev.map(team => 
          team.id === teamId 
            ? { ...team, member_count: team.member_count + 1 }
            : team
        ));
        setUnassignedCompetitors(prev => prev.filter(c => c.id !== competitorId));
      }
    } catch (error) {
      console.error('Error removing member:', error);
      alert('Failed to remove member');
      
      // Revert optimistic update on error
      const member = teamMembers[teamId]?.find(m => m.competitor_id === competitorId);
      const competitor = member?.competitor;
      
      if (member && competitor) {
        setTeamMembers(prev => ({
          ...prev,
          [teamId]: [...(prev[teamId] || []), member]
        }));
        setTeams(prev => prev.map(team => 
          team.id === teamId 
            ? { ...team, member_count: team.member_count + 1 }
            : team
        ));
        setUnassignedCompetitors(prev => prev.filter(c => c.id !== competitorId));
      }
    }
  };

  const deleteTeam = async (teamId: string) => {
    if (!confirm('Are you sure you want to delete this team? All members will be unassigned.')) {
      return;
    }

    try {
      // First remove all team members
      const currentMembers = teamMembers[teamId] || [];
      for (const member of currentMembers) {
        await fetch(`/api/teams/${teamId}/members/${member.competitor_id}`, {
          method: 'DELETE',
        });
      }

      // Then delete the team
      const response = await fetch(`/api/teams/${teamId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchData();
      } else {
        alert('Failed to delete team');
      }
    } catch (error) {
      console.error('Error deleting team:', error);
      alert('Failed to delete team');
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Check if we're dragging a competitor over a team
    const isCompetitor = unassignedCompetitors.some(c => c.id === activeId);
    const isTeam = teams.some(t => t.id === overId);

    if (isCompetitor && isTeam) {
      // The visual feedback is now handled by the useDroppable hook in DroppableTeam
      // This provides automatic highlighting when dragging over teams
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over) {
      setActiveId(null);
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;

    // Check if we're dropping a competitor onto a team
    const competitor = unassignedCompetitors.find(c => c.id === activeId);
    const team = teams.find(t => t.id === overId);

    if (competitor && team) {
      addMemberToTeam(activeId, overId);
    }

    setActiveId(null);
  };

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
            Drag students to teams or use the interface below
          </p>
        </div>

        {/* Two Box Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Box - Unassigned Students */}
          <Card className="bg-meta-card border-meta-border">
            <CardHeader>
              <CardTitle className="text-meta-light text-lg">Unassigned Students</CardTitle>
              <CardDescription className="text-meta-muted">
                Students not assigned to any team ({unassignedCompetitors.length})
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Search Filter */}
              <div className="mb-4">
                <Input
                  placeholder="Search competitors..."
                  value={competitorSearchTerm}
                  onChange={(e) => setCompetitorSearchTerm(e.target.value)}
                  className="bg-meta-dark border-meta-border text-meta-light"
                />
              </div>
              
              <SortableContext
                items={filteredUnassignedCompetitors.map(c => c.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {filteredUnassignedCompetitors.length === 0 ? (
                    <div className="text-center py-8 text-meta-muted">
                      {unassignedCompetitors.length === 0 ? (
                        <>
                          <Users className="mx-auto h-8 w-8 mb-2" />
                          <p>All students are assigned to teams</p>
                        </>
                      ) : (
                        <>
                          <Users className="mx-auto h-8 w-8 mb-2" />
                          <p>No competitors found matching "{competitorSearchTerm}"</p>
                        </>
                      )}
                    </div>
                  ) : (
                    filteredUnassignedCompetitors.map((competitor) => (
                      <DraggableCompetitor key={competitor.id} competitor={competitor} />
                    ))
                  )}
                </div>
              </SortableContext>
            </CardContent>
          </Card>

          {/* Right Box - Teams */}
          <Card className="bg-meta-card border-meta-border">
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
                  <Button
                    onClick={createTeam}
                    disabled={!newTeamName.trim() || isCreatingTeam}
                    size="sm"
                    className="bg-meta-accent hover:bg-blue-600"
                  >
                    {isCreatingTeam ? 'Creating...' : <Plus className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Teams List */}
              {teams.length > 0 && (
                <div className="mb-3 flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAllCollapsed(!allCollapsed)}
                    className="text-meta-muted border-meta-border hover:bg-meta-accent hover:text-white"
                  >
                    {allCollapsed ? 'Expand All' : 'Collapse All'}
                  </Button>
                </div>
              )}
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {teams.length === 0 ? (
                  <div className="text-center py-8 text-meta-muted">
                    <Users className="mx-auto h-8 w-8 mb-2" />
                    <p>No teams created yet</p>
                    <p className="text-xs">Create your first team above</p>
                  </div>
                                 ) : (
                   teams.map((team) => (
                     <DroppableTeam
                       key={team.id}
                       team={team}
                       teamMembers={teamMembers[team.id] || []}
                       onDeleteTeam={deleteTeam}
                       onRemoveMember={removeMemberFromTeam}
                       allCollapsed={allCollapsed}
                     />
                   ))
                 )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Instructions */}
        <Card className="bg-meta-card border-meta-border">
          <CardContent className="pt-6">
            <div className="text-center text-sm text-meta-muted">
              <p className="mb-2"><strong>How to use:</strong></p>
              <p>1. <strong>Drag & Drop:</strong> Drag students from left box and drop onto teams</p>
              <p>2. <strong>Create Team:</strong> Type team name and click + button</p>
              <p>3. <strong>Remove:</strong> Use - buttons to remove students, X buttons to delete teams</p>
              <p>4. <strong>Visual Feedback:</strong> Teams highlight when dragging over them</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeId ? (
          <div className="p-3 border border-meta-accent rounded-lg bg-meta-card shadow-lg">
            <p className="text-meta-light font-medium">
              {unassignedCompetitors.find(c => c.id === activeId)?.first_name} {unassignedCompetitors.find(c => c.id === activeId)?.last_name}
            </p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
