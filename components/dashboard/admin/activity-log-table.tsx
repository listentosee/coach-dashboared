'use client'

import { useState, useEffect, useCallback } from 'react'
import { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ChevronLeft, ChevronRight, X, Loader2 } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────

interface ActivityLog {
  id: string
  user_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  metadata: Record<string, any> | null
  ip_address: string | null
  created_at: string
  user_email: string | null
}

interface ApiResponse {
  logs: ActivityLog[]
  total: number
  page: number
  perPage: number
}

// ── Action categories & colors ───────────────────────────────────────

const ACTION_CATEGORIES: Record<string, string[]> = {
  Competitor: [
    'competitor_created', 'competitor_updated', 'competitor_deleted',
    'competitor_viewed', 'competitor_bulk_imported', 'profile_link_regenerated',
    'competitor_status_changed',
  ],
  Team: [
    'team_created', 'team_updated', 'team_deleted',
    'team_member_added', 'team_member_removed',
  ],
  Disclosure: [
    'data_disclosed_zoho', 'data_disclosed_game_platform',
    'data_disclosed_third_party',
  ],
  Agreement: [
    'agreement_sent', 'agreement_signed', 'agreement_viewed',
    'agreement_voided', 'consent_revoked',
  ],
  Admin: [
    'bulk_status_update', 'admin_access', 'password_reset',
  ],
}

function getCategoryForAction(action: string): string {
  for (const [cat, actions] of Object.entries(ACTION_CATEGORIES)) {
    if (actions.includes(action)) return cat
  }
  return 'Other'
}

const CATEGORY_COLORS: Record<string, string> = {
  Competitor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  Team: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  Disclosure: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  Agreement: 'bg-green-500/20 text-green-300 border-green-500/30',
  Admin: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  Other: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatAction(action: string): string {
  return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function summarizeMetadata(action: string, metadata: Record<string, any> | null): string {
  if (!metadata) return '—'
  if (action === 'competitor_bulk_imported') {
    const parts: string[] = []
    if (metadata.inserted != null) parts.push(`${metadata.inserted} inserted`)
    if (metadata.updated != null) parts.push(`${metadata.updated} updated`)
    if (metadata.errors != null && metadata.errors > 0) parts.push(`${metadata.errors} errors`)
    if (metadata.skipped != null && metadata.skipped > 0) parts.push(`${metadata.skipped} skipped`)
    return parts.length > 0 ? parts.join(', ') : '—'
  }
  if (metadata.disclosed_to) return `To: ${metadata.disclosed_to}`
  if (metadata.provider) return `Provider: ${metadata.provider}`
  if (metadata.template_kind) return `Template: ${metadata.template_kind}`
  // Generic: show first key-value
  const keys = Object.keys(metadata).slice(0, 2)
  if (keys.length === 0) return '—'
  return keys.map(k => `${k}: ${JSON.stringify(metadata[k])}`).join(', ').slice(0, 80)
}

// ── Columns ─────────────────────────────────────────────────────────

const columns: ColumnDef<ActivityLog, any>[] = [
  {
    id: 'created_at',
    accessorKey: 'created_at',
    header: 'Time',
    cell: ({ row }) => {
      const dt = row.original.created_at
      return (
        <span title={new Date(dt).toLocaleString()} className="whitespace-nowrap text-xs">
          {relativeTime(dt)}
        </span>
      )
    },
  },
  {
    id: 'user_email',
    accessorKey: 'user_email',
    header: 'User',
    cell: ({ row }) => (
      <span className="text-xs truncate max-w-[160px] block">
        {row.original.user_email || 'System'}
      </span>
    ),
  },
  {
    id: 'action',
    accessorKey: 'action',
    header: 'Action',
    cell: ({ row }) => {
      const action = row.original.action
      const cat = getCategoryForAction(action)
      const colorClass = CATEGORY_COLORS[cat]
      return (
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colorClass}`}>
          {formatAction(action)}
        </span>
      )
    },
  },
  {
    id: 'entity',
    header: 'Entity',
    cell: ({ row }) => {
      const { entity_type, entity_id } = row.original
      if (!entity_type && !entity_id) return <span className="text-xs text-muted-foreground">—</span>
      return (
        <span className="text-xs">
          {entity_type && <span className="text-muted-foreground">{entity_type}</span>}
          {entity_id && (
            <span className="ml-1 font-mono text-[10px] text-muted-foreground" title={entity_id}>
              {entity_id.slice(0, 8)}
            </span>
          )}
        </span>
      )
    },
  },
  {
    id: 'summary',
    header: 'Summary',
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground truncate max-w-[200px] block">
        {summarizeMetadata(row.original.action, row.original.metadata)}
      </span>
    ),
  },
]

// ── Main Component ──────────────────────────────────────────────────

export function ActivityLogTable() {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [perPage] = useState(50)
  const [loading, setLoading] = useState(true)

  // Filters
  const [actionFilter, setActionFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Detail dialog
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('perPage', String(perPage))
      if (actionFilter) params.set('action', actionFilter)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)

      const res = await fetch(`/api/admin/activity-logs?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data: ApiResponse = await res.json()
      setLogs(data.logs)
      setTotal(data.total)
    } catch {
      setLogs([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, perPage, actionFilter, dateFrom, dateTo])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [actionFilter, dateFrom, dateTo])

  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const showingFrom = total === 0 ? 0 : (page - 1) * perPage + 1
  const showingTo = Math.min(page * perPage, total)

  const clearFilters = () => {
    setActionFilter('')
    setDateFrom('')
    setDateTo('')
  }

  const hasFilters = actionFilter || dateFrom || dateTo

  return (
    <div className="space-y-3">
      {/* ── Filters ────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-700 bg-slate-900/50 p-3">
        {/* Action filter */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Action</label>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 min-w-[200px]"
          >
            <option value="">All Actions</option>
            {Object.entries(ACTION_CATEGORIES).map(([category, actions]) => (
              <optgroup key={category} label={category}>
                {actions.map(a => (
                  <option key={a} value={a}>{formatAction(a)}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Date range */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200"
          />
        </div>

        {/* Clear */}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* ── Table ──────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={logs}
          initialSortId="created_at"
          initialSortDesc
          onRowClick={(row) => setSelectedLog(row)}
          scrollContainerClassName="max-h-[calc(100vh-340px)] overflow-auto"
        />
      )}

      {/* ── Pagination ─────────────────────────────── */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total > 0 ? `Showing ${showingFrom}–${showingTo} of ${total}` : 'No results'}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Button>
          <span className="text-xs">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Detail Dialog ──────────────────────────── */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedLog && formatAction(selectedLog.action)}
            </DialogTitle>
            <DialogDescription>
              {selectedLog && new Date(selectedLog.created_at).toLocaleString()}
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-muted-foreground">User:</span>{' '}
                  <span>{selectedLog.user_email || 'System'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Action:</span>{' '}
                  <span>{formatAction(selectedLog.action)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Entity Type:</span>{' '}
                  <span>{selectedLog.entity_type || '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Entity ID:</span>{' '}
                  <span className="font-mono text-xs">{selectedLog.entity_id || '—'}</span>
                </div>
                {selectedLog.ip_address && (
                  <div>
                    <span className="text-muted-foreground">IP:</span>{' '}
                    <span className="font-mono text-xs">{selectedLog.ip_address}</span>
                  </div>
                )}
              </div>

              {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                <div>
                  <h4 className="font-medium mb-2 text-muted-foreground">Metadata</h4>
                  <pre className="rounded-md bg-slate-900 border border-slate-700 p-3 text-xs overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
