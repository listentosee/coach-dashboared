'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, ArrowLeft, Plus, Minus, Users } from 'lucide-react';

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

interface TeamMemberManagerProps {
  teamId: string;
  teamName: string;
  onSuccess: () => void;
}

export function TeamMemberManager({ teamId, teamName, onSuccess }: TeamMemberManagerProps) {
  const [availableCompetitors, setAvailableCompetitors] = useState<Competitor[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedCompetitor, setSelectedCompetitor] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      // Fetch available competitors (not on any team)
      const competitorsResponse = await fetch('/api/competitors');
      if (competitorsResponse.ok) {
        const data = await competitorsResponse.json();
        const available = data.competitors?.filter((c: Competitor) => !c.team_id) || [];
        setAvailableCompetitors(available);
      }

      // Fetch current team members
      const membersResponse = await fetch(`/api/teams/${teamId}/members`);
      if (membersResponse.ok) {
        const data = await membersResponse.json();
        setTeamMembers(data.members || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddMember = async () => {
    if (!selectedCompetitor) return;

    setIsAdding(true);
    try {
      // Find next available position
      const takenPositions = teamMembers.map(m => m.position);
      const nextPosition = [1, 2, 3, 4, 5, 6].find(p => !takenPositions.includes(p));
      
      if (!nextPosition) {
        alert('Team is at maximum capacity (6 members)');
        return;
      }

      const response = await fetch(`/api/teams/${teamId}/members/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competitor_id: selectedCompetitor,
          position: nextPosition,
        }),
      });

      if (response.ok) {
        setSelectedCompetitor(null);
        fetchData();
        onSuccess();
      } else {
        const errorData = await response.json();
        alert('Failed to add member: ' + errorData.error);
      }
    } catch (error) {
      console.error('Error adding member:', error);
      alert('Failed to add member');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!selectedMember) return;

    setIsRemoving(true);
    try {
      const member = teamMembers.find(m => m.id === selectedMember);
      if (!member) return;

      const response = await fetch(`/api/teams/${teamId}/members/${member.competitor_id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSelectedMember(null);
        fetchData();
        onSuccess();
      } else {
        alert('Failed to remove member');
      }
    } catch (error) {
      console.error('Error removing member:', error);
      alert('Failed to remove member');
    } finally {
      setIsRemoving(false);
    }
  };

  const handleDragStart = (e: React.DragEvent, competitorId: string) => {
    e.dataTransfer.setData('competitorId', competitorId);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const competitorId = e.dataTransfer.getData('competitorId');
    if (competitorId) {
      setSelectedCompetitor(competitorId);
      // Auto-add the dragged competitor
      setTimeout(() => handleAddMember(), 100);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  if (isLoading) {
    return <div className="text-center py-4 text-meta-muted">Loading...</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Box - Available Competitors */}
      <Card className="bg-meta-card border-meta-border">
        <CardHeader>
          <CardTitle className="text-meta-light text-lg">Available Students</CardTitle>
          <CardDescription className="text-meta-muted">
            Students not assigned to any team ({availableCompetitors.length})
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {availableCompetitors.length === 0 ? (
              <div className="text-center py-8 text-meta-muted">
                <Users className="mx-auto h-8 w-8 mb-2" />
                <p>No available students</p>
              </div>
            ) : (
              availableCompetitors.map((competitor) => (
                <div
                  key={competitor.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, competitor.id)}
                  className={`p-3 border rounded-lg cursor-move transition-colors ${
                    selectedCompetitor === competitor.id
                      ? 'border-meta-accent bg-meta-accent/10'
                      : 'border-meta-border hover:border-meta-accent'
                  }`}
                  onClick={() => setSelectedCompetitor(competitor.id)}
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
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Center - Action Buttons */}
      <div className="flex flex-col items-center justify-center space-y-4 lg:col-span-1">
        <Button
          onClick={handleAddMember}
          disabled={!selectedCompetitor || isAdding || teamMembers.length >= 6}
          className="bg-green-600 hover:bg-green-700 disabled:opacity-50"
        >
          <ArrowRight className="mr-2 h-4 w-4" />
          {isAdding ? 'Adding...' : 'Add to Team'}
        </Button>

        <Button
          onClick={handleRemoveMember}
          disabled={!selectedMember || isRemoving}
          variant="outline"
          className="border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {isRemoving ? 'Removing...' : 'Remove from Team'}
        </Button>

        <div className="text-center text-sm text-meta-muted">
          <p>Drag & drop students</p>
          <p>or use the buttons</p>
        </div>
      </div>

      {/* Right Box - Team Members */}
      <Card className="bg-meta-card border-meta-border">
        <CardHeader>
          <CardTitle className="text-meta-light text-lg">{teamName} Members</CardTitle>
          <CardDescription className="text-meta-muted">
            Current team members ({teamMembers.length}/6)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="space-y-2 max-h-96 overflow-y-auto min-h-[200px] border-2 border-dashed border-meta-border rounded-lg p-4"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            {teamMembers.length === 0 ? (
              <div className="text-center py-8 text-meta-muted">
                <Users className="mx-auto h-8 w-8 mb-2" />
                <p>No team members yet</p>
                <p className="text-xs">Drag students here or use the add button</p>
              </div>
            ) : (
              teamMembers.map((member) => (
                <div
                  key={member.id}
                  className={`p-3 border rounded-lg transition-colors ${
                    selectedMember === member.id
                      ? 'border-meta-accent bg-meta-accent/10'
                      : 'border-meta-border hover:border-meta-accent'
                  }`}
                  onClick={() => setSelectedMember(member.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-6 h-6 bg-meta-accent text-white rounded-full flex items-center justify-center text-xs font-medium">
                        {member.position}
                      </div>
                      <div>
                        <p className="font-medium text-meta-light">
                          {member.competitor.first_name} {member.competitor.last_name}
                        </p>
                        {member.competitor.grade && (
                          <p className="text-sm text-meta-muted">Grade {member.competitor.grade}</p>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className="border-meta-accent text-meta-accent">
                      Position {member.position}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
