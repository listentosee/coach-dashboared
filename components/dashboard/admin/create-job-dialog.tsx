'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase/client';

const TASK_TYPES = [
  { value: 'game_platform_sync', label: 'Incremental Sync (game_platform_sync)' },
  { value: 'game_platform_totals_sweep', label: 'Totals Sweep (game_platform_totals_sweep)' },
  { value: 'game_platform_profile_refresh', label: 'Profile Refresh (game_platform_profile_refresh)' },
  { value: 'game_platform_onboard_competitors', label: 'Onboard Competitors (game_platform_onboard_competitors)' },
  { value: 'game_platform_onboard_coaches', label: 'Onboard Coaches (game_platform_onboard_coaches)' },
  { value: 'sms_digest_processor', label: 'Coach Alert Digest (sms_digest_processor)' },
  { value: 'admin_alert_dispatch', label: 'Admin Instant Alerts (admin_alert_dispatch)' },
  { value: 'release_parent_email_verification', label: 'Release Parent Email Verification (release_parent_email_verification)' },
  { value: 'message_read_receipts_backfill', label: 'Message Read Receipt Backfill (message_read_receipts_backfill)' },
];

const TASKS_WITH_COACH_FILTER = new Set([
  'game_platform_sync',
  'game_platform_totals_sweep',
  'game_platform_profile_refresh',
  'game_platform_onboard_competitors',
  'game_platform_onboard_coaches',
  'sms_digest_processor',
]);

const COMMON_INTERVALS = [
  { value: 5, label: '5 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 360, label: '6 hours' },
  { value: 720, label: '12 hours' },
  { value: 1440, label: '24 hours (daily)' },
];

const DURATION_OPTIONS = [
  { value: 'forever', label: 'Forever (until manually stopped)' },
  { value: '60', label: '1 hour' },
  { value: '360', label: '6 hours' },
  { value: '1440', label: '1 day' },
  { value: '10080', label: '1 week' },
  { value: '43200', label: '30 days' },
];

export function CreateJobDialog() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [coaches, setCoaches] = useState<Array<{ id: string; full_name: string; email: string }>>([]);
  const [formData, setFormData] = useState({
    task_type: 'game_platform_sync',
    is_recurring: false,
    recurrence_interval_minutes: 60,
    duration: 'forever',
    run_at: '',
    coachId: '',
    forceSyncScope: 'none',
    syncMode: 'standard',
    syncTeamsMode: 'wrap',
    batchSize: 50,
    forceNotifications: false,
    competitorIds: '',
    forceReonboard: false,
    forceTotalsSweepAll: false,
  });

  useEffect(() => {
    async function fetchCoaches() {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('role', 'coach')
        .order('full_name');

      if (data) setCoaches(data);
    }

    fetchCoaches();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const parsedCompetitorIds = formData.competitorIds
        .split(/[\s,]+/)
        .map((id) => id.trim())
        .filter(Boolean);

      if (formData.task_type === 'game_platform_onboard_competitors' && parsedCompetitorIds.length > 0 && !formData.coachId) {
        throw new Error('Select a coach when targeting specific competitor IDs.');
      }

      if (formData.task_type === 'game_platform_onboard_competitors' && formData.forceReonboard && parsedCompetitorIds.length === 0) {
        throw new Error('Force re-onboard requires at least one competitor ID.');
      }

      const payload = (() => {
        switch (formData.task_type) {
          case 'game_platform_sync': {
            const forceSyncScope = formData.forceSyncScope;
            const forceFullSync = forceSyncScope === 'odl' || forceSyncScope === 'both';
            const forceFlashCtfSync = forceSyncScope === 'ctf' || forceSyncScope === 'both';
            const payload: any = {
              dryRun: false,
              coachId: formData.coachId || null,
              forceFullSync,
              forceFlashCtfSync,
            };
            if (formData.syncMode === 'wave') {
              payload.mode = 'wave';
              payload.batchSize = Math.max(1, Math.min(200, Math.floor(Number(formData.batchSize) || 50)));
              if (formData.syncTeamsMode === 'always') payload.syncTeams = true;
              if (formData.syncTeamsMode === 'never') payload.syncTeams = false;
            }
            return payload;
          }
          case 'game_platform_profile_refresh':
            return {
              dryRun: false,
              coachId: formData.coachId || null,
            };
          case 'game_platform_totals_sweep':
            return {
              dryRun: false,
              coachId: formData.coachId || null,
              batchSize: Math.max(1, Math.min(200, Math.floor(Number(formData.batchSize) || 100))),
              forceAll: formData.forceTotalsSweepAll,
            };
          case 'game_platform_onboard_competitors':
            return {
              batchSize: 50,
              coachId: formData.coachId || null,
              onlyActive: true,
              source: parsedCompetitorIds.length > 0 ? 'manual' : 'backfill',
              competitorIds: parsedCompetitorIds.length > 0 ? parsedCompetitorIds : undefined,
              forceReonboard: formData.forceReonboard && parsedCompetitorIds.length > 0,
            };
          case 'game_platform_onboard_coaches':
            return {
              coachId: formData.coachId || null,
              dryRun: false,
              source: formData.coachId ? 'manual' : 'backfill',
            };
          case 'release_parent_email_verification':
            return {
              dryRun: false,
              staleHours: 24,
              limit: 50,
            };
          case 'sms_digest_processor':
            return {
              dryRun: false,
              coachId: formData.coachId || null,
              force: formData.forceNotifications,
              roles: ['coach'],
              allowSms: true,
            };
          case 'admin_alert_dispatch':
            return {
              dryRun: false,
              coachId: null,
              force: false,
              roles: ['admin'],
              allowSms: false,
              windowMinutes: formData.recurrence_interval_minutes || 60,
            };
          case 'message_read_receipts_backfill':
            return {
              dryRun: false,
              batchSize: 500,
            };
          default:
            return { batchSize: 50, coachId: formData.coachId || null };
        }
      })();

      const expiresAt = !formData.is_recurring || formData.duration === 'forever'
        ? null
        : new Date(Date.now() + parseInt(formData.duration) * 60 * 1000).toISOString();

      const runAt = formData.run_at
        ? new Date(formData.run_at).toISOString()
        : new Date().toISOString();

      const res = await fetch('/api/admin/jobs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_type: formData.task_type,
          payload,
          is_recurring: formData.is_recurring,
          recurrence_interval_minutes: formData.is_recurring ? formData.recurrence_interval_minutes : null,
          expires_at: expiresAt,
          run_at: runAt,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create job');
      }

      setIsOpen(false);
      setFormData({
        task_type: 'game_platform_sync',
        is_recurring: false,
        recurrence_interval_minutes: 60,
        duration: 'forever',
        run_at: '',
        coachId: '',
        forceSyncScope: 'none',
        syncMode: 'standard',
        syncTeamsMode: 'wrap',
        batchSize: 50,
        forceNotifications: false,
        competitorIds: '',
        forceReonboard: false,
        forceTotalsSweepAll: false,
      });
      router.refresh();
    } catch (error) {
      console.error('[create-job] Failed:', error);
      alert(error instanceof Error ? error.message : 'Failed to create job');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="bg-blue-600 text-white hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-2" />
          Create Job
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Create Job</DialogTitle>
          <DialogDescription className="text-gray-600">
            Create a one-time or recurring background job.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="task_type" className="text-gray-900">Task Type</Label>
            <select
              id="task_type"
              value={formData.task_type}
              onChange={(e) => setFormData({ ...formData, task_type: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 bg-white text-gray-900"
              required
            >
              {TASK_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {TASKS_WITH_COACH_FILTER.has(formData.task_type) && (
            <div>
              <Label htmlFor="coach_id" className="text-gray-900">Coach (optional)</Label>
              <select
                id="coach_id"
                value={formData.coachId}
                onChange={(e) => setFormData({ ...formData, coachId: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 bg-white text-gray-900"
              >
                <option value="">All Coaches</option>
                {coaches.map((coach) => (
                  <option key={coach.id} value={coach.id}>
                    {coach.full_name || coach.email}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">Leave empty to target everyone</p>
            </div>
          )}

          {formData.task_type === 'game_platform_onboard_competitors' && (
            <>
              <div>
                <Label htmlFor="competitor_ids" className="text-gray-900">Competitor IDs (optional)</Label>
                <Textarea
                  id="competitor_ids"
                  value={formData.competitorIds}
                  onChange={(e) => setFormData({ ...formData, competitorIds: e.target.value })}
                  placeholder="Paste competitor UUIDs (comma or newline separated)"
                  className="bg-white text-gray-900 border-gray-300"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Leave empty to scan all eligible competitors for the selected coach.
                </p>
              </div>
              <div className="flex items-center gap-3 p-3 border rounded bg-gray-50">
                <Switch
                  checked={formData.forceReonboard}
                  onCheckedChange={(checked) => setFormData({ ...formData, forceReonboard: checked })}
                />
                <div>
                  <Label className="text-gray-900">Force Re-onboard</Label>
                  <p className="text-xs text-gray-600">
                    Clears local game platform mapping before onboarding (use only with specific competitor IDs).
                  </p>
                </div>
              </div>
            </>
          )}

          {formData.task_type === 'game_platform_totals_sweep' && (
            <div className="flex items-center gap-3 p-3 border rounded bg-gray-50">
              <Switch
                checked={formData.forceTotalsSweepAll}
                onCheckedChange={(checked) => setFormData({ ...formData, forceTotalsSweepAll: checked })}
              />
              <div>
                <Label className="text-gray-900">Force Sweep All</Label>
                <p className="text-xs text-gray-600">
                  Recalculate totals for every synced competitor (batched).
                </p>
              </div>
            </div>
          )}

          {formData.task_type === 'admin_alert_dispatch' && (
            <div className="p-3 border rounded bg-gray-50 text-sm text-gray-700">
              Sends instant alerts to all admins with notifications enabled every time the job runs.
              Use the recurring schedule to control how often (recommended: every 5 minutes).
            </div>
          )}

          {formData.task_type === 'game_platform_sync' && (
            <div className="p-3 border rounded bg-gray-50">
              <div>
                <Label htmlFor="sync_mode" className="text-gray-900">Sync Mode</Label>
                <select
                  id="sync_mode"
                  value={formData.syncMode}
                  onChange={(e) => setFormData({ ...formData, syncMode: e.target.value })}
                  className="mt-2 w-full border border-gray-300 rounded px-3 py-2 bg-white text-gray-900"
                >
                  <option value="standard">Standard (all users)</option>
                  <option value="wave">Wave (batch per run)</option>
                </select>
                <p className="text-xs text-gray-600 mt-2">
                  Wave mode processes a small batch each run and wraps to the start when complete.
                </p>
              </div>

              {formData.syncMode === 'wave' && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="batch_size" className="text-gray-900">Batch Size</Label>
                    <Input
                      id="batch_size"
                      type="number"
                      min={1}
                      max={200}
                      value={formData.batchSize}
                      onChange={(e) => {
                        const nextValue = Number(e.target.value);
                        setFormData({ ...formData, batchSize: Number.isFinite(nextValue) ? nextValue : 50 });
                      }}
                      className="mt-2 bg-white text-gray-900 border-gray-300"
                    />
                  </div>
                  <div>
                    <Label htmlFor="sync_teams_mode" className="text-gray-900">Team Sync</Label>
                    <select
                      id="sync_teams_mode"
                      value={formData.syncTeamsMode}
                      onChange={(e) => setFormData({ ...formData, syncTeamsMode: e.target.value })}
                      className="mt-2 w-full border border-gray-300 rounded px-3 py-2 bg-white text-gray-900"
                    >
                      <option value="wrap">On wave wrap (recommended)</option>
                      <option value="always">Every batch</option>
                      <option value="never">Never</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="mt-3">
                <Label htmlFor="force_sync_scope" className="text-gray-900">Force Sync Scope</Label>
                <select
                  id="force_sync_scope"
                  value={formData.forceSyncScope}
                  onChange={(e) => setFormData({ ...formData, forceSyncScope: e.target.value })}
                  className="mt-2 w-full border border-gray-300 rounded px-3 py-2 bg-white text-gray-900"
                >
                  <option value="none">None (incremental)</option>
                  <option value="odl">ODL only</option>
                  <option value="ctf">CTF only</option>
                  <option value="both">ODL + CTF</option>
                </select>
                <p className="text-xs text-gray-600 mt-2">
                  Choose which data to fully resync. ODL resets the incremental timestamp; CTF forces Flash CTF refresh.
                </p>
              </div>
            </div>
          )}

          {formData.task_type === 'sms_digest_processor' && (
            <div className="flex items-center gap-3 p-3 border rounded bg-gray-50">
              <Switch
                checked={formData.forceNotifications}
                onCheckedChange={(checked) => setFormData({ ...formData, forceNotifications: checked })}
              />
              <div>
                <Label className="text-gray-900">Force Send Alerts</Label>
                <p className="text-xs text-gray-600">
                  Ignore cooldowns and send notifications to all coaches with unread messages.
                </p>
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="run_at" className="text-gray-900">Run At (optional)</Label>
            <Input
              id="run_at"
              type="datetime-local"
              value={formData.run_at}
              onChange={(e) => setFormData({ ...formData, run_at: e.target.value })}
              className="bg-white text-gray-900 border-gray-300"
            />
            <p className="text-xs text-gray-500 mt-1">Leave empty to run immediately</p>
          </div>

          <div className="flex items-center gap-3 p-3 border rounded bg-gray-50">
            <Switch
              checked={formData.is_recurring}
              onCheckedChange={(checked) => setFormData({ ...formData, is_recurring: checked })}
            />
            <div>
              <Label className="text-gray-900">Recurring Job</Label>
              <p className="text-xs text-gray-600">Job runs repeatedly on a schedule</p>
            </div>
          </div>

          {formData.is_recurring && (
            <>
              <div>
                <Label htmlFor="interval" className="text-gray-900">How Often</Label>
                <select
                  id="interval"
                  value={formData.recurrence_interval_minutes}
                  onChange={(e) =>
                    setFormData({ ...formData, recurrence_interval_minutes: parseInt(e.target.value) })
                  }
                  className="w-full border border-gray-300 rounded px-3 py-2 bg-white text-gray-900"
                  required
                >
                  {COMMON_INTERVALS.map((interval) => (
                    <option key={interval.value} value={interval.value}>
                      {interval.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="duration" className="text-gray-900">How Long</Label>
                <select
                  id="duration"
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 bg-white text-gray-900"
                  required
                >
                  {DURATION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-blue-600 text-white hover:bg-blue-700">
              {isSubmitting ? 'Creating...' : 'Create Job'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
