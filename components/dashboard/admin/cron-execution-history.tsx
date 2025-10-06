'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react';

interface CronRun {
  runid: number;
  jobid: number;
  jobname: string;
  status: string;
  return_message: string | null;
  start_time: string;
  end_time: string | null;
}

interface CronExecutionHistoryProps {
  runs: CronRun[];
}

export function CronExecutionHistory({ runs }: CronExecutionHistoryProps) {
  const [selectedRun, setSelectedRun] = useState<CronRun | null>(null);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'succeeded':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'running':
        return <Clock className="h-4 w-4 text-blue-600 animate-spin" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'succeeded':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Success</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Failed</Badge>;
      case 'running':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Running</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatDuration = (start: string, end: string | null) => {
    if (!end) return 'In progress';
    const durationMs = new Date(end).getTime() - new Date(start).getTime();
    if (durationMs < 1000) return `${durationMs}ms`;
    if (durationMs < 60000) return `${(durationMs / 1000).toFixed(1)}s`;
    return `${(durationMs / 60000).toFixed(1)}m`;
  };

  const formatTime = (time: string) => {
    return new Date(time).toLocaleString();
  };

  if (runs.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-8 text-center">
        <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600">No execution history found</p>
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
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Start Time
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Duration
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Message
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {runs.map((run) => (
              <tr key={run.runid} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{run.jobname}</div>
                  <div className="text-xs text-gray-500">Run ID: {run.runid}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(run.status)}
                    {getStatusBadge(run.status)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {formatTime(run.start_time)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {formatDuration(run.start_time, run.end_time)}
                </td>
                <td className="px-6 py-4">
                  {run.return_message ? (
                    <div className="max-w-md">
                      <pre className="text-xs text-gray-700 whitespace-pre-wrap break-words overflow-hidden">
                        {run.return_message.length > 200
                          ? run.return_message.substring(0, 200) + '...'
                          : run.return_message}
                      </pre>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">No message</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedRun(run)}
                  >
                    Details
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Details Dialog */}
      <Dialog open={!!selectedRun} onOpenChange={(open) => !open && setSelectedRun(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Execution Details</DialogTitle>
            <DialogDescription>
              Run ID: {selectedRun?.runid} | Job: {selectedRun?.jobname}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-medium text-gray-500">Status</div>
                <div className="mt-1">{selectedRun && getStatusBadge(selectedRun.status)}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500">Duration</div>
                <div className="mt-1 text-sm text-gray-900">
                  {selectedRun && formatDuration(selectedRun.start_time, selectedRun.end_time)}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500">Start Time</div>
                <div className="mt-1 text-sm text-gray-900">
                  {selectedRun && formatTime(selectedRun.start_time)}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500">End Time</div>
                <div className="mt-1 text-sm text-gray-900">
                  {selectedRun?.end_time ? formatTime(selectedRun.end_time) : 'In progress'}
                </div>
              </div>
            </div>

            {selectedRun?.return_message && (
              <div>
                <div className="text-sm font-medium text-gray-500 mb-2">Return Message</div>
                <div className="bg-gray-50 border border-gray-200 rounded p-3">
                  <pre className="text-xs text-gray-800 whitespace-pre-wrap break-words max-h-96 overflow-y-auto">
                    {selectedRun.return_message}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
