"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MessageSquare, Megaphone, Users } from "lucide-react"

export type ConversationRow = {
  id: string
  type: 'dm' | 'announcement' | 'group'
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
      cell: ({ row }) => {
        const t = row.original.type
        const title = row.original.title || (t === 'announcement' ? 'Announcement' : t === 'group' ? 'Group' : 'Direct Message')
        const Icon = t === 'announcement' ? Megaphone : t === 'group' ? Users : MessageSquare
        const isUnread = (row.original.unread_count ?? 0) > 0
        return (
          <button type="button" className="w-full text-left" onClick={() => onOpen(row.original.id)}>
            <div className={`flex items-center gap-2 ${isUnread ? 'font-medium text-meta-light' : ''}`}>
              <Icon className="h-4 w-4" />
              <span className="text-sm truncate" title={title}>{title}</span>
            </div>
          </button>
        )
      }
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
