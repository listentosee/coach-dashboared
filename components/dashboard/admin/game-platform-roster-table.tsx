"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

export interface GamePlatformRosterRow {
  competitor_id: string;
  competitor_name: string;
  email_school: string | null;
  email_personal: string | null;
  onboarded_email_type: 'personal' | 'school' | null;
  game_platform_id: string | null;
  metactf_role: string | null;
  metactf_user_id: number | null;
  metactf_username: string | null;
  metactf_status: string | null;
  last_result: string | null;
  last_attempt_at: string | null;
  last_accessed_at: string | null;
  last_login_at: string | null;
  error_message: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  approved: "bg-emerald-500/20 text-emerald-200",
  user_created: "bg-sky-500/20 text-sky-200",
  pending: "bg-amber-500/20 text-amber-100",
  denied: "bg-rose-500/20 text-rose-200",
  error: "bg-rose-500/20 text-rose-200",
};

const RESULT_STYLES: Record<string, string> = {
  success: "bg-emerald-500/20 text-emerald-200",
  failure: "bg-rose-500/20 text-rose-200",
};

const formatToken = (value?: string | null) => {
  if (!value) return "-";
  return value.replace(/_/g, " ");
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

const sortHeader = (label: string) => ({ column }: { column: any }) => (
  <Button
    variant="ghost"
    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    className="h-auto p-0 font-medium text-left hover:bg-transparent"
  >
    {label}
    {column.getIsSorted() === "asc" ? (
      <ChevronUp className="ml-2 h-4 w-4" />
    ) : column.getIsSorted() === "desc" ? (
      <ChevronDown className="ml-2 h-4 w-4" />
    ) : (
      <ChevronsUpDown className="ml-2 h-4 w-4" />
    )}
  </Button>
);

export function GamePlatformRosterTable({ rows }: { rows: GamePlatformRosterRow[] }) {
  const columns = useMemo<ColumnDef<GamePlatformRosterRow>[]>(() => [
    {
      accessorKey: "competitor_name",
      header: sortHeader("Competitor"),
      cell: ({ row }) => {
        const schoolEmail = row.original.email_school;
        const personalEmail = row.original.email_personal;
        const onboardedType = row.original.onboarded_email_type;
        return (
          <div className="min-w-[260px]">
            <div className="font-medium text-meta-light">{row.original.competitor_name || "-"}</div>
            {schoolEmail && (
              <div className="text-xs text-meta-muted">
                S: {schoolEmail}
                {onboardedType === 'school' && <span className="ml-1 text-amber-300">*</span>}
              </div>
            )}
            {personalEmail && (
              <div className="text-xs text-meta-muted">
                P: {personalEmail}
                {onboardedType === 'personal' && <span className="ml-1 text-amber-300">*</span>}
              </div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "last_accessed_at",
      header: sortHeader("Last Activity"),
      cell: ({ row }) => {
        const lastAccessed = row.original.last_accessed_at;
        return lastAccessed ? (
          <div className="text-sm text-meta-light">
            {formatDate(lastAccessed)}
          </div>
        ) : (
          <Badge className="bg-slate-600/40 text-slate-200">Never</Badge>
        );
      },
    },
    {
      accessorKey: "last_login_at",
      header: sortHeader("Last Login"),
      cell: ({ row }) => {
        const lastLogin = row.original.last_login_at;
        return lastLogin ? (
          <div className="text-sm text-meta-light">
            {formatDate(lastLogin)}
          </div>
        ) : (
          <Badge className="bg-slate-600/40 text-slate-200">Never</Badge>
        );
      },
    },
    {
      accessorKey: "game_platform_id",
      header: ({ column }) => (
        <div className="min-w-[200px]">
          {sortHeader("Game Platform ID")({ column })}
        </div>
      ),
      cell: ({ row }) => (
        <div className="min-w-[200px] whitespace-nowrap font-mono text-xs text-meta-muted">
          {row.original.game_platform_id ?? "-"}
        </div>
      ),
    },
    {
      accessorKey: "metactf_role",
      header: sortHeader("MetaCTF Role"),
      cell: ({ row }) => {
        const role = row.original.metactf_role;
        if (!role) return <span className="text-meta-muted">-</span>;
        return (
          <Badge className="bg-slate-700/70 text-slate-100">
            {formatToken(role)}
          </Badge>
        );
      },
    },
    {
      accessorKey: "metactf_user_id",
      header: sortHeader("MetaCTF User ID"),
      cell: ({ row }) => (
        <div className="font-mono text-xs text-meta-muted break-all">
          {row.original.metactf_user_id ?? "-"}
        </div>
      ),
    },
    {
      accessorKey: "metactf_username",
      header: sortHeader("MetaCTF Username"),
      cell: ({ row }) => (
        <div className="text-sm text-meta-light">
          {row.original.metactf_username ?? "-"}
        </div>
      ),
    },
    {
      accessorKey: "metactf_status",
      header: sortHeader("MetaCTF Status"),
      cell: ({ row }) => {
        const status = row.original.metactf_status;
        if (!status) return <span className="text-meta-muted">-</span>;
        return (
          <Badge className={STATUS_STYLES[status] ?? "bg-slate-600/40 text-slate-200"}>
            {formatToken(status)}
          </Badge>
        );
      },
    },
    {
      accessorKey: "last_result",
      header: sortHeader("Last Result"),
      cell: ({ row }) => {
        const result = row.original.last_result;
        if (!result) return <span className="text-meta-muted">-</span>;
        return (
          <Badge className={RESULT_STYLES[result] ?? "bg-slate-600/40 text-slate-200"}>
            {formatToken(result)}
          </Badge>
        );
      },
    },
    {
      accessorKey: "last_attempt_at",
      header: sortHeader("Last Attempt"),
      cell: ({ row }) => (
        <div className="text-sm text-meta-light">
          {formatDate(row.original.last_attempt_at)}
        </div>
      ),
    },
    {
      
    {
      accessorKey: "error_message",
      header: sortHeader("Error Message"),
      cell: ({ row }) => {
        const message = row.original.error_message;
        if (!message) return <span className="text-meta-muted">-</span>;
        return (
          <div
            className="max-w-[320px] text-xs text-rose-200 whitespace-pre-wrap break-words"
            title={message}
          >
            {message}
          </div>
        );
      },
    },
  ], []);

  return (
    <DataTable
      columns={columns}
      data={rows}
      initialSortId="competitor_name"
      scrollContainerClassName="max-h-[70vh] overflow-auto"
    />
  );
}
