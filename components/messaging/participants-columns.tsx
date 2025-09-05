"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"

export type ParticipantRow = {
  user_id: string
  first_name?: string
  last_name?: string
  email?: string
}

export function createParticipantsColumns(
  onMute: (userId: string, minutes: number | null) => void
): ColumnDef<ParticipantRow, any>[] {
  return [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <span className="text-sm">{(row.original.first_name || row.original.last_name) ? `${row.original.first_name || ''} ${row.original.last_name || ''}`.trim() : row.original.email}</span>
      )
    },
    { accessorKey: 'email', header: 'Email', cell: ({ row }) => <span className="text-xs text-meta-muted">{row.original.email}</span> },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="text-right space-x-2">
          <Button size="sm" variant="secondary" onClick={() => onMute(row.original.user_id, 60)}>Mute 60m</Button>
          <Button size="sm" variant="ghost" onClick={() => onMute(row.original.user_id, null)}>Unmute</Button>
        </div>
      )
    }
  ]
}

