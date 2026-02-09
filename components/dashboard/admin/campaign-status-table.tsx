"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";

const STATUS_CLASSES: Record<string, string> = {
  draft: "bg-slate-400/20 text-slate-100",
  pending: "bg-yellow-400/20 text-yellow-100",
  sending: "bg-blue-400/20 text-blue-100",
  sent: "bg-emerald-400/20 text-emerald-100",
  failed: "bg-red-400/20 text-red-100",
};

export interface CampaignRow {
  id: string;
  subject: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  total_recipients: number;
  total_queued: number;
  total_delivered: number;
  total_bounced: number;
  total_dropped: number;
  total_blocked: number;
  total_skipped: number;
}

const columns: ColumnDef<CampaignRow, unknown>[] = [
  {
    accessorKey: "subject",
    header: "Subject",
    cell: ({ row }) => (
      <span className="max-w-[200px] truncate block" title={row.original.subject}>
        {row.original.subject}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const cls = STATUS_CLASSES[row.original.status] ?? "bg-gray-400/20 text-gray-200";
      return (
        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
          {row.original.status}
        </span>
      );
    },
  },
  {
    accessorKey: "total_recipients",
    header: "Total",
  },
  {
    accessorKey: "total_delivered",
    header: "Delivered",
    cell: ({ row }) => (
      <span className="text-emerald-300">{row.original.total_delivered}</span>
    ),
  },
  {
    accessorKey: "total_bounced",
    header: "Bounced",
    cell: ({ row }) => {
      const count = row.original.total_bounced + row.original.total_dropped + row.original.total_blocked;
      return count > 0 ? <span className="text-red-300">{count}</span> : <span>0</span>;
    },
  },
  {
    accessorKey: "total_skipped",
    header: "Skipped",
    cell: ({ row }) =>
      row.original.total_skipped > 0 ? (
        <span className="text-yellow-300">{row.original.total_skipped}</span>
      ) : (
        <span>0</span>
      ),
  },
  {
    accessorKey: "total_queued",
    header: "Queued",
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) => {
      const d = new Date(row.original.created_at);
      return <span className="text-xs text-muted-foreground">{d.toLocaleDateString()} {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>;
    },
  },
];

interface CampaignStatusTableProps {
  campaigns: CampaignRow[];
}

export function CampaignStatusTable({ campaigns }: CampaignStatusTableProps) {
  if (campaigns.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No competitor announcement campaigns yet.
      </p>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={campaigns}
      initialSortId="created_at"
      initialSortDesc
    />
  );
}
