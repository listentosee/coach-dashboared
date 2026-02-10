"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { marked } from "marked";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

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
  body_markdown: string;
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

interface CampaignStatusTableProps {
  campaigns: CampaignRow[];
  onUseAsTemplate?: (subject: string, bodyMarkdown: string) => void;
}

marked.use({ gfm: true, breaks: true });

export function CampaignStatusTable({ campaigns, onUseAsTemplate }: CampaignStatusTableProps) {
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignRow | null>(null);

  const renderedHtml = useMemo(() => {
    if (!selectedCampaign?.body_markdown) return "";
    return marked.parse(selectedCampaign.body_markdown) as string;
  }, [selectedCampaign?.body_markdown]);

  const columns: ColumnDef<CampaignRow, unknown>[] = [
    {
      accessorKey: "subject",
      header: "Subject",
      cell: ({ row }) => (
        <button
          type="button"
          className="max-w-[200px] truncate block text-left text-blue-400 hover:text-blue-300 underline underline-offset-2 cursor-pointer"
          title={row.original.subject}
          onClick={() => setSelectedCampaign(row.original)}
        >
          {row.original.subject}
        </button>
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

  if (campaigns.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No competitor announcement campaigns yet.
      </p>
    );
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={campaigns}
        initialSortId="created_at"
        initialSortDesc
      />

      <Dialog open={!!selectedCampaign} onOpenChange={(open) => { if (!open) setSelectedCampaign(null) }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedCampaign?.subject}</DialogTitle>
            <DialogDescription>
              {selectedCampaign && (
                <span className="flex items-center gap-3 mt-1">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[selectedCampaign.status] ?? "bg-gray-400/20 text-gray-200"}`}>
                    {selectedCampaign.status}
                  </span>
                  <span className="text-xs">
                    {new Date(selectedCampaign.created_at).toLocaleDateString()}{" "}
                    {new Date(selectedCampaign.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {selectedCampaign.total_recipients > 0 && (
                    <span className="text-xs">
                      {selectedCampaign.total_delivered}/{selectedCampaign.total_recipients} delivered
                    </span>
                  )}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {renderedHtml && (
            <div
              className="mt-2 rounded-md border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-200 leading-relaxed [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mb-1 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_li]:mb-1 [&_a]:text-blue-400 [&_a]:underline [&_strong]:font-bold [&_em]:italic [&_blockquote]:border-l-2 [&_blockquote]:border-slate-600 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-slate-400 [&_code]:bg-slate-800 [&_code]:px-1 [&_code]:rounded [&_pre]:bg-slate-800 [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_hr]:border-slate-700 [&_hr]:my-3"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          )}

          {onUseAsTemplate && selectedCampaign && (
            <DialogFooter>
              <Button
                variant="secondary"
                onClick={() => {
                  onUseAsTemplate(selectedCampaign.subject, selectedCampaign.body_markdown);
                  setSelectedCampaign(null);
                }}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Use as Template
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
