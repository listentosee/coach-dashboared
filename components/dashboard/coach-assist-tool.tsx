'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/client';

interface Coach {
  id: string;
  email: string;
  full_name: string;
  school_name: string;
}

export default function CoachAssistTool() {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [selectedCoachId, setSelectedCoachId] = useState<string>('');
  const [duration, setDuration] = useState<string>('24');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string; link?: string } | null>(null);

  useEffect(() => {
    fetchCoaches();
  }, []);

  const fetchCoaches = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, school_name')
        .eq('role', 'coach')
        .order('full_name');

      if (error) throw error;
      setCoaches(data || []);
    } catch (error) {
      console.error('Error fetching coaches:', error);
    }
  };

  const generateAccessLink = async () => {
    if (!selectedCoachId) {
      setResult({ type: 'error', message: 'Please select a coach' });
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/admin/assist-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coachId: selectedCoachId,
          duration: parseInt(duration)
        })
      });

      const data = await response.json();

      if (response.ok) {
        setResult({
          type: 'success',
          message: data.message,
          link: data.data.accessLink
        });
      } else {
        setResult({
          type: 'error',
          message: data.error
        });
      }
    } catch (error) {
      setResult({
        type: 'error',
        message: 'Failed to generate access link'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // You could add a toast notification here
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>👥 Coach Access Assistant</CardTitle>
        <CardDescription>
          Generate temporary access links for coaches to help them with their accounts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Coach</label>
            <Select value={selectedCoachId} onValueChange={setSelectedCoachId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a coach..." />
              </SelectTrigger>
              <SelectContent>
                {coaches.map((coach) => (
                  <SelectItem key={coach.id} value={coach.id}>
                    {coach.full_name} - {coach.school_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Link Duration</label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 hour</SelectItem>
                <SelectItem value="6">6 hours</SelectItem>
                <SelectItem value="24">24 hours</SelectItem>
                <SelectItem value="72">3 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button 
          onClick={generateAccessLink} 
          disabled={isLoading || !selectedCoachId}
          className="w-full"
        >
          {isLoading ? 'Generating...' : 'Generate Access Link'}
        </Button>

        {result && (
          <Card className={`${result.type === 'success' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
            <CardContent className="pt-6">
              <p className={result.type === 'success' ? 'text-green-800' : 'text-red-800'}>
                {result.message}
              </p>
              
              {result.link && (
                <div className="mt-4 p-3 bg-white rounded border">
                  <p className="text-sm text-gray-600 mb-2">Access Link:</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={result.link}
                      readOnly
                      className="flex-1 p-2 text-sm border rounded bg-gray-50 text-gray-900"
                    />
                    <Button
                      size="sm"
                      onClick={() => copyToClipboard(result.link!)}
                      variant="outline"
                    >
                      Copy
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Send this link to the coach. They can click it to access their dashboard.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}
