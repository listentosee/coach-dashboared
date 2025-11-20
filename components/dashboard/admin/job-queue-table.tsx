"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";

const STATUS_LABELS: Record<string, string> = {
  all: "All",
  pending: "Pending",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
};

const STATUS_CLASSES: Record<string, string> = {
  pending: "bg-yellow-400/20 text-yellow-100",
  running: "bg-blue-400/20 text-blue-100",
  succeeded: "bg-emerald-400/20 text-emerald-100",
  failed: "bg-red-400/20 text-red-100",
  cancelled: "bg-gray-400/20 text-gray-200",
};

export interface JobQueueRow {
  id: string;
  task_type: string;
  payload: unknown;
  status: string;
  run_at: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  output: unknown;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  is_recurring: boolean;
  recurrence_interval_minutes: number | null;
  expires_at: string | null;
  last_run_at: string | null;
}

interface JobQueueTableProps {
  jobs: JobQueueRow[];
  statusCounts: Record<string, number>;
  initialStatus?: string;
}

export function JobQueueTable({ jobs, statusCounts, initialStatus = "all" }: JobQueueTableProps) {
  const [statusFilter, setStatusFilter] = useState<string>(
    STATUS_LABELS[initialStatus] ? initialStatus : "all"
  );

  const filteredJobs = useMemo(() => {
    if (statusFilter === "all") return jobs;
    return jobs.filter((job) => job.status === statusFilter);
  }, [jobs, statusFilter]);

  const columns = useMemo<ColumnDef<JobQueueRow>[]>(() => [
    {
      accessorKey: "id",
      header: "Job ID",
      cell: ({ row }) => (
        <div className="font-mono text-xs text-slate-100 break-all">
          {row.original.id}
        </div>
      ),
    },
    {
      accessorKey: "task_type",
      header: "Task",
      cell: ({ row }) => (
        <div className="space-y-1">
          <div className="text-sm font-semibold text-white">
            {formatTaskLabel(row.original.task_type)}
          </div>
          <div className="text-xs text-slate-300/90">
            {summarizePayload(row.original)}
          </div>
          {row.original.is_recurring && (
            <span className="inline-flex items-center rounded-full bg-purple-500/20 px-2 py-0.5 text-xs font-semibold text-purple-100">
              ↻ {row.original.recurrence_interval_minutes ?? 0}m
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
            STATUS_CLASSES[row.original.status] || "bg-gray-100 text-gray-800"
          }`}
        >
          {STATUS_LABELS[row.original.status] ?? row.original.status}
        </span>
      ),
    },
    {
      accessorKey: "attempts",
      header: "Attempts",
      cell: ({ row }) => (
        <span className="text-sm text-white">
          {row.original.attempts} / {row.original.max_attempts}
        </span>
      ),
    },
    {
      accessorKey: "created_at",
      header: "Created",
      cell: ({ row }) => (
        <div className="text-sm text-slate-200">
          {formatDate(row.original.created_at)}
        </div>
      ),
    },
    {
      accessorKey: "run_at",
      header: "Scheduled Run",
      cell: ({ row }) => {
        const runAt = new Date(row.original.run_at);
        const pastDue = row.original.status === "pending" && runAt < new Date();
        return (
          <div className={pastDue ? "text-red-400 font-semibold" : "text-sm text-slate-200"}>
            {formatDate(row.original.run_at)}
            {pastDue && (
              <div className="text-xs text-red-400/80">
                Overdue by {formatDuration(Date.now() - runAt.getTime())}
              </div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "last_error",
      header: "Last Error",
      cell: ({ row }) => (
        <div className="max-w-xs whitespace-pre-wrap text-xs text-slate-200/80" title={row.original.last_error ?? ''}>
          {row.original.last_error ?? '—'}
        </div>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex flex-col gap-2 min-w-[150px]">
          <form method="post" action="/api/admin/job-queue/actions">
            <input type="hidden" name="jobId" value={row.original.id} />
            <input type="hidden" name="action" value="retry" />
            <button
              type="submit"
              className="w-full rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Retry now
            </button>
          </form>
          <form method="post" action="/api/admin/job-queue/actions">
            <input type="hidden" name="jobId" value={row.original.id} />
            <input type="hidden" name="action" value="cancel" />
            <button
              type="submit"
              className="w-full rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700"
            >
              Cancel
            </button>
          </form>
          <form method="post" action="/api/admin/job-queue/actions">
            <input type="hidden" name="jobId" value={row.original.id} />
            <input type="hidden" name="action" value="delete" />
            <button
              type="submit"
              className="w-full rounded border border-slate-500 px-2 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-800"
            >
              Delete
            </button>
          </form>
        </div>
      ),
    },
  ], []);

  const getRowClassName = (job: JobQueueRow) => {
    const runAt = new Date(job.run_at);
    if (job.status === "pending" && runAt < new Date()) {
      return "bg-red-500/15";
    }
    return undefined;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatusFilter(key)}
            className={`rounded border px-3 py-2 text-left text-sm font-medium transition-colors ${
              statusFilter === key
                ? "border-sky-500 bg-sky-500/10 text-white"
                : "border-slate-600/70 bg-slate-800/70 text-slate-200 hover:border-slate-500"
            }`}
          >
            <div className="text-xs uppercase tracking-wide text-slate-300">{label}</div>
            <div className="text-2xl font-semibold text-white">{statusCounts[key] ?? 0}</div>
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={filteredJobs}
        initialSortId="run_at"
        initialSortDesc
        getRowClassName={getRowClassName}
        scrollContainerClassName="max-h-[70vh] overflow-x-auto"
      />
    </div>
  );
}

function formatDate(input: string) {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function formatDuration(ms: number) {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours}h ${remaining}m`;
}

function formatTaskLabel(taskType: string) {
  switch (taskType) {
    case 'game_platform_sync':
      return 'Game Platform Sync';
    case 'game_platform_totals_sweep':
      return 'Totals Sweep';
    case 'sms_digest_processor':
      return 'Coach Alert Digest';
    case 'admin_alert_dispatch':
      return 'Admin Instant Alerts';
    default:
      return taskType;
  }
}

function summarizePayload(job: JobQueueRow) {
  const payload = job.payload as Record<string, any> | null;
  if (!payload) return 'No payload';

  if (payload.coachId) {
    return `Target coach ${payload.coachId}`;
  }

  if (payload.roles && Array.isArray(payload.roles)) {
    return `Audience: ${(payload.roles as string[]).join(', ')}`;
  }

  if (payload.forceFullSync) {
    return 'Force full sync';
  }

  if (payload.force) {
    return 'Force alerts';
  }

  return 'All recipients';
}
