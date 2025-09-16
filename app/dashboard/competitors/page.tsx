'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase/client';
import { CompetitorForm } from '@/components/dashboard/competitor-form';
import { useAdminCoachContext } from '@/lib/admin/useAdminCoachContext';
import ActingAsBanner from '@/components/admin/ActingAsBanner';

interface Competitor {
  id: string;
  first_name: string;
  last_name: string;
  email_personal?: string;
  email_school?: string;
  grade?: string;
  status: 'pending' | 'active' | 'inactive';
  created_at: string;
}

export default function CompetitorsPage() {
  const { coachId, loading: ctxLoading } = useAdminCoachContext()
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdmin, setIsAdmin] = useState(false)
  const [visibleCount, setVisibleCount] = useState(40)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // Derived list before effects that depend on it
  const filteredCompetitors = competitors.filter(competitor => {
    const term = searchTerm.toLowerCase();
    const nameStarts = competitor.first_name.toLowerCase().startsWith(term) ||
      competitor.last_name.toLowerCase().startsWith(term);
    const emailMatches = competitor.email_personal?.toLowerCase().includes(term) ||
      competitor.email_school?.toLowerCase().includes(term);
    return nameStarts || !!emailMatches;
  });

  // Initial and context-based fetch
  useEffect(() => {
    if (!ctxLoading) fetchCompetitors();
  }, [ctxLoading, coachId])

  // Reset paging when data or filters change
  useEffect(() => { setVisibleCount(40) }, [searchTerm])
  useEffect(() => { setVisibleCount(40) }, [competitors.length])

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const node = sentinelRef.current
    if (!node) return
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + 20, filteredCompetitors.length))
        }
      }
    }, { root: null, rootMargin: '200px', threshold: 0 })
    obs.observe(node)
    return () => obs.disconnect()
  }, [filteredCompetitors.length])

  const fetchCompetitors = async () => {
    try {
      // Use server-filtered API route for both admin and coach reads
      const r = await fetch('/api/competitors')
      if (r.ok) {
        const j = await r.json()
        setCompetitors((j.competitors || []) as Competitor[])
        setIsAdmin(!!j.isAdmin)
      } else {
        setCompetitors([])
      }
    } catch (error) {
      console.error('Error fetching competitors:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'inactive':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Competitors</h1>
          <p className="text-gray-600 mt-2">
            Manage your competitors and track their progress
          </p>
          <ActingAsBanner />
        </div>
        <CompetitorForm onSuccess={fetchCompetitors} disabled={isAdmin && !ctxLoading && coachId === null} disabledTooltip="Select a coach to edit" />
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Search Competitors</CardTitle>
          <CardDescription>
            Find competitors by name or email
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Competitors List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                All Competitors ({filteredCompetitors.length})
              </CardTitle>
              <CardDescription>
                {competitors.length === 0 
                  ? 'No competitors added yet. Add your first competitor to get started!'
                  : 'View and manage all competitors in your program'
                }
              </CardDescription>
            </div>
            <div className="text-sm text-gray-500">
              Showing {Math.min(visibleCount, filteredCompetitors.length)} of {filteredCompetitors.length}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredCompetitors.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {searchTerm ? 'No competitors found matching your search.' : 'No competitors added yet.'}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredCompetitors.slice(0, visibleCount).map((competitor) => (
                <div
                  key={competitor.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <div>
                        <h3 className="font-medium text-gray-900">
                          {competitor.first_name} {competitor.last_name}
                        </h3>
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          {competitor.email_personal && (
                            <span>Personal: {competitor.email_personal}</span>
                          )}
                          {competitor.email_school && (
                            <span>School: {competitor.email_school}</span>
                          )}
                          {competitor.grade && (
                            <span>Grade: {competitor.grade}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(competitor.status)}`}>
                      {competitor.status}
                    </span>
                    <span className="text-xs text-gray-400">
                      Added {new Date(competitor.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
              {/* Sentinel for infinite scroll */}
              <div ref={sentinelRef} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
