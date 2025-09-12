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
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string; link?: string } | null>(null);
  const [resetResult, setResetResult] = useState<{ type: 'success' | 'error'; message: string; temp?: string } | null>(null);

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

  // Magic link generation removed.

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // You could add a toast notification here
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const resetPassword = async () => {
    if (!selectedCoachId) {
      setResetResult({ type: 'error', message: 'Please select a coach' });
      return;
    }
    setIsResetting(true);
    setResetResult(null);
    try {
      const res = await fetch('/api/admin/reset-coach-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachId: selectedCoachId })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to reset password')
      setResetResult({ type: 'success', message: 'Temporary password generated. Share securely with the coach.', temp: json.tempPassword })
    } catch (e: any) {
      setResetResult({ type: 'error', message: e.message || 'Failed to reset password' })
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>👥 Coach Access Assistant</CardTitle>
        <CardDescription>
          Admin-only password reset. Issue a temporary password; the coach signs in and is forced to set a new one.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border p-3 text-sm bg-amber-50 border-amber-200 text-amber-900">
          <p className="font-medium mb-1">Instructions</p>
          <ol className="list-decimal ml-5 space-y-1">
            <li>Select the coach and click “Reset Password (Admin)”.</li>
            <li>Copy the temporary password and share it via a secure channel.</li>
            <li>The coach signs in with email + temporary password.</li>
            <li>They are redirected to set a new password before entering the app.</li>
          </ol>
        </div>
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
          {/* Magic-link duration removed */}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-1 gap-2">
          <Button
            onClick={resetPassword}
            disabled={isResetting || !selectedCoachId}
            className="w-full"
            variant="secondary"
          >
            {isResetting ? 'Resetting...' : 'Reset Password (Admin)'}
          </Button>
        </div>
        {/* Magic-link UI removed */}

        {resetResult && (
          <Card className={`${resetResult.type === 'success' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
            <CardContent className="pt-6 space-y-2">
              <p className={resetResult.type === 'success' ? 'text-green-800' : 'text-red-800'}>
                {resetResult.message}
              </p>
              {resetResult.temp && (
                <div className="mt-1 p-3 bg-white rounded border">
                  <p className="text-sm text-gray-600 mb-2">Temporary Password:</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={resetResult.temp}
                      readOnly
                      className="flex-1 p-2 text-sm border rounded bg-gray-50 text-gray-900"
                    />
                    <Button size="sm" onClick={() => copyToClipboard(resetResult.temp!)} variant="outline">Copy</Button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Share this securely. The coach must use it to sign in and will be forced to set a new password.
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
