'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, Calendar, Clock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface ScheduleTemplate {
  id: string;
  name: string;
  description: string;
  pattern: string;
  jobs: {
    name: string;
    schedule: string;
    taskType: 'game_platform_sync' | 'game_platform_totals_sweep';
    explanation: string;
  }[];
  useCase: string;
}

const TEMPLATES: ScheduleTemplate[] = [
  {
    id: 'competition-active',
    name: 'Competition Active (High Frequency)',
    description: 'Frequent syncs during active competition hours',
    pattern: 'Every 15 minutes',
    jobs: [
      {
        name: 'game_platform_sync_active',
        schedule: '*/15 * * * *',
        taskType: 'game_platform_sync',
        explanation: 'Incremental sync every 15 minutes',
      },
      {
        name: 'game_platform_totals_active',
        schedule: '5,20,35,50 * * * *',
        taskType: 'game_platform_totals_sweep',
        explanation: 'Totals sweep 5 minutes after each incremental sync',
      },
    ],
    useCase: 'Use during CTF competitions when you need near real-time updates',
  },
  {
    id: 'standard',
    name: 'Standard Operations (Current Setup)',
    description: 'Balanced sync frequency for normal operations',
    pattern: 'Every 30 minutes / hourly',
    jobs: [
      {
        name: 'game_platform_sync_incremental',
        schedule: '*/30 * * * *',
        taskType: 'game_platform_sync',
        explanation: 'Incremental sync every 30 minutes',
      },
      {
        name: 'game_platform_totals_sweep_hourly',
        schedule: '0 * * * *',
        taskType: 'game_platform_totals_sweep',
        explanation: 'Totals sweep every hour at minute 0',
      },
    ],
    useCase: 'Default setup - good balance of freshness and resource usage',
  },
  {
    id: 'coordinated',
    name: 'Coordinated Hourly',
    description: 'Incremental sync followed by totals sweep every hour',
    pattern: 'Sequential every hour',
    jobs: [
      {
        name: 'game_platform_sync_coordinated',
        schedule: '0 * * * *',
        taskType: 'game_platform_sync',
        explanation: 'Incremental sync at the top of each hour',
      },
      {
        name: 'game_platform_totals_coordinated',
        schedule: '10 * * * *',
        taskType: 'game_platform_totals_sweep',
        explanation: 'Totals sweep 10 minutes later (ensures sync completes first)',
      },
    ],
    useCase: 'Ensures totals always reflect the latest incremental data',
  },
  {
    id: 'off-season',
    name: 'Off-Season (Low Frequency)',
    description: 'Reduced sync frequency to save resources',
    pattern: 'Every 4 hours',
    jobs: [
      {
        name: 'game_platform_sync_offseason',
        schedule: '0 */4 * * *',
        taskType: 'game_platform_sync',
        explanation: 'Incremental sync every 4 hours',
      },
      {
        name: 'game_platform_totals_offseason',
        schedule: '15 */4 * * *',
        taskType: 'game_platform_totals_sweep',
        explanation: 'Totals sweep 15 minutes after sync',
      },
    ],
    useCase: 'Use when competitions are not active to reduce API calls and database load',
  },
  {
    id: 'business-hours',
    name: 'Business Hours Only',
    description: 'Sync only during working hours (9 AM - 5 PM weekdays)',
    pattern: 'Hourly 9-5 Mon-Fri',
    jobs: [
      {
        name: 'game_platform_sync_business',
        schedule: '0 9-17 * * 1-5',
        taskType: 'game_platform_sync',
        explanation: 'Incremental sync hourly 9 AM - 5 PM Mon-Fri',
      },
      {
        name: 'game_platform_totals_business',
        schedule: '15 9-17 * * 1-5',
        taskType: 'game_platform_totals_sweep',
        explanation: 'Totals sweep 15 minutes after sync',
      },
    ],
    useCase: 'Use for classroom/lab environments that only operate during business hours',
  },
];

export function CronScheduleTemplates() {
  const [copiedTemplate, setCopiedTemplate] = useState<string | null>(null);

  const generateSQL = (template: ScheduleTemplate): string => {
    const sqlStatements = template.jobs.map(
      (job) => `
-- ${job.explanation}
SELECT cron.schedule(
  job_name => '${job.name}',
  schedule => '${job.schedule}',
  command => $$
    SELECT public.job_queue_enqueue(
      p_task_type := '${job.taskType}',
      p_payload := '{}'::jsonb,
      p_run_at := now(),
      p_max_attempts := 3
    );
  $$
);`
    );

    return `-- ${template.name}
-- ${template.description}
-- Use Case: ${template.useCase}
${sqlStatements.join('\n')}

-- To verify the jobs were created:
-- SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname LIKE 'game_platform%';
`;
  };

  const copyToClipboard = async (template: ScheduleTemplate) => {
    const sql = generateSQL(template);
    try {
      await navigator.clipboard.writeText(sql);
      setCopiedTemplate(template.id);
      setTimeout(() => setCopiedTemplate(null), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Calendar className="h-4 w-4 mr-2" />
          Schedule Templates
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cron Schedule Templates</DialogTitle>
          <DialogDescription>
            Pre-configured sync patterns for common use cases. Click to copy SQL and paste in
            Supabase SQL Editor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {TEMPLATES.map((template) => (
            <Card key={template.id} className="overflow-hidden">
              <CardHeader className="bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {template.name}
                      <Badge variant="secondary">{template.pattern}</Badge>
                    </CardTitle>
                    <CardDescription className="mt-1">{template.description}</CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(template)}
                    className="ml-4"
                  >
                    {copiedTemplate === template.id ? (
                      <>
                        <Check className="h-4 w-4 mr-2 text-green-600" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy SQL
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="mb-3">
                  <p className="text-sm text-gray-600">
                    <strong>Use Case:</strong> {template.useCase}
                  </p>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-gray-900">Jobs in this pattern:</h4>
                  {template.jobs.map((job, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <Clock className="h-5 w-5 text-blue-500 mt-0.5" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <code className="text-sm font-mono font-semibold">{job.name}</code>
                          <Badge variant="outline" className="text-xs">
                            {job.schedule}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-600">{job.explanation}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Task: <code className="bg-white px-1 rounded">{job.taskType}</code>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs text-blue-800">
                    <strong>⚠️ Before applying:</strong> Delete existing jobs with similar names to
                    avoid duplicates. Run:{' '}
                    <code className="bg-white px-1 rounded text-blue-900">
                      SELECT cron.unschedule('job_name');
                    </code>
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-6 p-4 bg-gray-100 rounded-lg">
          <h4 className="text-sm font-semibold mb-2">How to Apply a Template:</h4>
          <ol className="text-sm text-gray-700 space-y-1 list-decimal list-inside">
            <li>Click "Copy SQL" on your preferred template</li>
            <li>Go to Supabase Dashboard → SQL Editor</li>
            <li>Paste the SQL and click "Run"</li>
            <li>Verify jobs were created in the Cron Jobs table above</li>
            <li>
              Adjust schedules as needed using{' '}
              <code className="bg-white px-1 rounded">cron.alter_job()</code>
            </li>
          </ol>
        </div>
      </DialogContent>
    </Dialog>
  );
}
