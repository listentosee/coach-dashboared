'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function NiceFrameworkPage() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [stats, setStats] = useState<{ count: number; lastUpdated: string | null }>({
    count: 0,
    lastUpdated: null,
  });
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  // Load current stats on mount
  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/admin/nice-framework/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const handleSeed = async () => {
    setStatus('loading');
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await fetch('/api/admin/nice-framework/seed', {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to seed NICE Framework data');
      }

      setStatus('success');
      setStats({
        count: data.count,
        lastUpdated: new Date().toISOString(),
      });
      setSuccessMessage(`Successfully loaded ${data.count} NICE work roles from NIST`);

      // Reset success state after 5 seconds
      setTimeout(() => {
        setStatus('idle');
        setSuccessMessage('');
      }, 5000);
    } catch (error: any) {
      setStatus('error');
      setErrorMessage(error.message || 'An error occurred');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">NICE Framework Reference Data</h1>
        <p className="text-muted-foreground mt-2">
          Manage NIST NICE Framework work role translations
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Work Roles Lookup Table</CardTitle>
          <CardDescription>
            Fetches NICE Framework data from NIST to translate work role codes (e.g., "DD-WRL-003")
            into human-readable titles (e.g., "Secure Software Development")
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Work Roles in Database</div>
              <div className="text-3xl font-bold">{stats.count}</div>
            </div>

            {stats.lastUpdated && (
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Last Updated</div>
                <div className="text-sm">
                  {new Date(stats.lastUpdated).toLocaleString('en-US', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Error message */}
          {status === 'error' && errorMessage && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-medium text-destructive">Error</div>
                <div className="text-sm text-muted-foreground">{errorMessage}</div>
              </div>
            </div>
          )}

          {/* Success message */}
          {status === 'success' && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-green-500/10 border border-green-500/20">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-medium text-green-500">Success</div>
                <div className="text-sm text-muted-foreground">
                  {successMessage || 'NICE Framework data has been updated'}
                </div>
              </div>
            </div>
          )}

          {/* Action button */}
          <div className="flex items-center gap-4">
            <Button onClick={handleSeed} disabled={status === 'loading'} size="lg">
              {status === 'loading' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Fetching from NIST...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Fetch & Update NICE Data
                </>
              )}
            </Button>

            {status === 'idle' && stats.count === 0 && (
              <p className="text-sm text-muted-foreground">
                Click to fetch NICE Framework data from NIST for the first time
              </p>
            )}
          </div>

          {/* Info */}
          <div className="border-t pt-4 space-y-2">
            <div className="text-sm font-medium">What does this do?</div>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Fetches the latest NICE Framework work roles from NIST</li>
              <li>Populates the lookup table with work role IDs, titles, and descriptions</li>
              <li>Enables the UI to show "Secure Software Development" instead of "DD-WRL-003"</li>
              <li>Safe to run multiple times - updates existing records</li>
            </ul>

            <div className="text-xs text-muted-foreground pt-2">
              Data source:{' '}
              <a
                href="https://csrc.nist.gov/csrc/media/Projects/cprt/documents/nice/v2_nf_components.json"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                NIST NICE Framework v2
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
