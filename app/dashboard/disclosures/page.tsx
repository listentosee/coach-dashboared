/**
 * Disclosure Logs Page
 *
 * Admin page for viewing FERPA-compliant disclosure history for any competitor.
 * Includes search functionality with dropdown selector for easy competitor selection.
 */

'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { CompetitorDisclosureLogs } from '@/components/dashboard/competitor-disclosure-logs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Shield, Search, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface Competitor {
  id: string;
  first_name: string;
  last_name: string;
  email_school: string;
  grade?: string;
  coach_id: string;
}

export default function DisclosuresPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCompetitor, setSelectedCompetitor] = useState<Competitor | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchCompetitors();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchCompetitors = async () => {
    try {
      setLoading(true);

      // Check if user is admin
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile?.role !== 'admin') return;

      // Fetch all competitors for admin
      const { data, error } = await supabase
        .from('competitors')
        .select('id, first_name, last_name, email_school, grade, coach_id')
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true });

      if (error) throw error;
      setCompetitors(data || []);
    } catch (error) {
      console.error('Error fetching competitors:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter competitors based on search term
  const filteredCompetitors = useMemo(() => {
    if (!searchTerm.trim()) return [];

    const search = searchTerm.toLowerCase();
    return competitors
      .filter(c =>
        c.first_name.toLowerCase().includes(search) ||
        c.last_name.toLowerCase().includes(search) ||
        c.email_school.toLowerCase().includes(search) ||
        c.grade?.toLowerCase().includes(search)
      )
      .slice(0, 10); // Limit to 10 results
  }, [competitors, searchTerm]);

  const handleSelectCompetitor = (competitor: Competitor) => {
    setSelectedCompetitor(competitor);
    setSearchTerm(`${competitor.first_name} ${competitor.last_name}`);
    setShowDropdown(false);
  };

  const handleClear = () => {
    setSelectedCompetitor(null);
    setSearchTerm('');
    setShowDropdown(false);
  };

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Shield className="h-8 w-8" />
          Disclosure Logs
        </h1>
        <p className="text-muted-foreground mt-2">
          View FERPA-compliant disclosure history for competitors
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search for Competitor</CardTitle>
          <CardDescription>
            Search by name, email, or grade to view disclosure history
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="relative">
              <Label htmlFor="search">Search Competitor</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Type name, email, or grade..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setShowDropdown(true);
                    if (!e.target.value.trim()) {
                      setSelectedCompetitor(null);
                    }
                  }}
                  onFocus={() => setShowDropdown(true)}
                  className="pl-10"
                  disabled={loading}
                />
                {loading && (
                  <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>

              {/* Dropdown Results */}
              {showDropdown && filteredCompetitors.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-80 overflow-auto">
                  {filteredCompetitors.map((competitor) => (
                    <button
                      key={competitor.id}
                      onClick={() => handleSelectCompetitor(competitor)}
                      className="w-full px-4 py-3 text-left hover:bg-accent hover:text-accent-foreground transition-colors border-b border-border last:border-0"
                    >
                      <div className="font-medium">
                        {competitor.first_name} {competitor.last_name}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {competitor.email_school}
                        {competitor.grade && ` • Grade: ${competitor.grade}`}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {showDropdown && searchTerm.trim() && filteredCompetitors.length === 0 && (
                <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg p-4">
                  <p className="text-sm text-muted-foreground">
                    No competitors found matching "{searchTerm}"
                  </p>
                </div>
              )}
            </div>

            {selectedCompetitor && (
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <p className="font-medium">
                    {selectedCompetitor.first_name} {selectedCompetitor.last_name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {selectedCompetitor.email_school}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleClear}>
                  Clear
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedCompetitor && (
        <CompetitorDisclosureLogs competitorId={selectedCompetitor.id} />
      )}
    </div>
  );
}
