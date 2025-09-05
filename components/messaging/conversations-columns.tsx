"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MessageSquare, Megaphone, Users } from "lucide-react"

export type ConversationRow = {
  id: string
  type: 'dm' | 'announcement'
  title: string | null
  unread_count?: number
  last_message_at?: string | null
}

export function createConversationColumns(
  onOpen: (id: string) => void,
  onReplyPrivately?: (id: string) => void,
  isAdmin?: boolean
): ColumnDef<ConversationRow, any>[] {
  return [
    {
      id: 'conversation',
      header: 'Conversation',
      cell: ({ row }) => (
        <div className="space-y-1" onClick={() => onOpen(row.original.id)}>
          <div className="flex items-center gap-2">
            {row.original.type === 'announcement' ? <Megaphone className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
            <span className="text-sm">{row.original.type === 'announcement' ? 'Announcements' : 'Direct Message'}</span>
          </div>
          <div className={`text-xs text-meta-muted leading-snug break-words ${row.original.unread_count && row.original.unread_count > 0 ? 'font-medium text-meta-light' : ''}`}>
            {row.original.title || (row.original.type === 'announcement' ? 'Announcements' : 'DM')}
          </div>
          {/* Actions omitted to keep list compact; open on row click */}
        </div>
      )
    },
    {
      accessorKey: 'unread_count',
      header: 'Unread',
      cell: ({ row }) => {
        const count = Math.max(0, Number((row.original as any).unread_count ?? 0))
        return (
          <div className="text-right">
            {count > 0 ? (
              <Badge className="bg-red-600 text-white">{count}</Badge>
            ) : (
              <span className="text-xs text-meta-muted">&nbsp;</span>
            )}
          </div>
        )
      }
    }
  ]
}
