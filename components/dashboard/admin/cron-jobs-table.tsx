'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Clock, AlertCircle } from 'lucide-react';

interface CronJob {
  jobid: number;
  jobname: string;
  schedule: string;
  command: string;
  database: string;
  username: string;
  active: boolean;
}

interface CronJobsTableProps {
  jobs: CronJob[];
}

export function CronJobsTable({ jobs }: CronJobsTableProps) {
  const [cronJobs, setCronJobs] = useState(jobs);
  const [togglingJob, setTogglingJob] = useState<number | null>(null);

  const formatCommand = (command: string) => {
    // Truncate long commands for display
    if (command.length > 100) {
      return command.substring(0, 100) + '...';
    }
    return command;
  };

  const handleToggle = async (jobName: string, jobId: number, currentActive: boolean) => {
    const newStatus = !currentActive;
    const sql = `UPDATE cron.job SET active = ${newStatus} WHERE jobname = '${jobName}';`;

    const message =
      `Supabase restricts direct access to the cron schema for security.\n\n` +
      `To ${newStatus ? 'enable' : 'disable'} "${jobName}":\n\n` +
      `1. Go to Supabase Dashboard → SQL Editor\n` +
      `2. Run this SQL command:\n\n${sql}\n\n` +
      `The SQL has been copied to your clipboard.`;

    // Copy SQL to clipboard
    try {
      await navigator.clipboard.writeText(sql);
      alert(message);
    } catch (clipboardError) {
      // Fallback if clipboard fails
      alert(message + '\n\n(Clipboard copy failed - please copy the SQL manually)');
    }
  };

  const getScheduleDescription = (schedule: string) => {
    const patterns: Record<string, string> = {
      '* * * * *': 'Every minute',
      '*/5 * * * *': 'Every 5 minutes',
      '*/15 * * * *': 'Every 15 minutes',
      '*/30 * * * *': 'Every 30 minutes',
      '0 * * * *': 'Hourly',
      '0 */2 * * *': 'Every 2 hours',
      '0 0 * * *': 'Daily at midnight',
      '0 3 * * *': 'Daily at 3:00 AM',
    };
    return patterns[schedule] || schedule;
  };

  if (jobs.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-8 text-center">
        <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600">No cron jobs found</p>
        <p className="text-sm text-gray-500 mt-2">Cron jobs are managed via database migrations</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Job Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Schedule
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Command
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {cronJobs.map((job) => (
              <tr key={job.jobid} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{job.jobname}</div>
                  <div className="text-xs text-gray-500">ID: {job.jobid}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-gray-400" />
                    <div>
                      <div className="text-sm text-gray-900">{job.schedule}</div>
                      <div className="text-xs text-gray-500">{getScheduleDescription(job.schedule)}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <code className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">
                    {formatCommand(job.command)}
                  </code>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {job.active ? (
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={job.active}
                      onCheckedChange={() => handleToggle(job.jobname, job.jobid, job.active)}
                      disabled={togglingJob === job.jobid}
                    />
                    <span className="text-xs text-gray-500">
                      {togglingJob === job.jobid ? 'Updating...' : job.active ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
