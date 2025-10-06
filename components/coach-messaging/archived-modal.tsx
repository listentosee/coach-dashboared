"use client"

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ArchiveRestore, Search, MessageSquare } from 'lucide-react'
import type { CoachConversation, CoachMessage } from '@/lib/coach-messaging/types'
import { plainTextSnippet } from '@/lib/coach-messaging/utils'

type ArchivedItem = {
  message: CoachMessage
  conversation: CoachConversation
}

type ArchivedModalProps = {
  open: boolean
  onClose: () => void
  conversations: CoachConversation[]
  messagesByConversation: Record<string, CoachMessage[]>
  onRestore: (conversationId: string, messageId: string) => Promise<void>
}

export function ArchivedModal({ open, onClose, conversations, messagesByConversation, onRestore }: ArchivedModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [restoring, setRestoring] = useState<Set<string>>(new Set())

  // Build list of archived messages with their conversation context
  const archivedItems: ArchivedItem[] = []
  for (const conversation of conversations) {
    const messages = messagesByConversation[conversation.id] ?? []
    for (const message of messages) {
      if (message.archived_at) {
        archivedItems.push({ message, conversation })
      }
    }
  }

  const filteredItems = archivedItems.filter((item) => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    const title = (item.conversation.title || item.conversation.display_title || '').toLowerCase()
    const body = plainTextSnippet(item.message.body).toLowerCase()
    const sender = (item.message.sender_name || item.message.sender_email || '').toLowerCase()
    return title.includes(query) || body.includes(query) || sender.includes(query)
  })

  const handleRestore = async (conversationId: string, messageId: string) => {
    const key = `${conversationId}-${messageId}`
    setRestoring((prev) => new Set(prev).add(key))
    try {
      await onRestore(conversationId, messageId)
    } finally {
      setRestoring((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Archived Messages</DialogTitle>
        </DialogHeader>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-meta-muted" />
          <Input
            placeholder="Search archived messages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-1">
          {filteredItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-meta-muted">
              {archivedItems.length === 0
                ? 'No archived messages'
                : 'No messages match your search'}
            </div>
          ) : (
            filteredItems.map((item) => {
              const key = `${item.conversation.id}-${item.message.id}`
              const isRestoring = restoring.has(key)
              const conversationTitle = item.conversation.title || item.conversation.display_title || 'Conversation'
              const messagePreview = plainTextSnippet(item.message.body, 100)
              const sender = item.message.sender_name || item.message.sender_email || 'Unknown sender'
              const archivedDate = item.message.archived_at
                ? new Date(item.message.archived_at).toLocaleDateString()
                : ''
              const createdDate = new Date(item.message.created_at).toLocaleDateString()

              return (
                <div
                  key={key}
                  className="flex items-start gap-3 rounded-md border border-meta-border bg-meta-card/30 px-3 py-2.5 hover:bg-meta-card/50 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => handleRestore(item.conversation.id, item.message.id)}
                    disabled={isRestoring}
                    className="p-1.5 rounded hover:bg-meta-surface/80 text-meta-muted hover:text-meta-foreground transition-colors disabled:opacity-50 flex-shrink-0 mt-0.5"
                    title="Restore message"
                  >
                    <ArchiveRestore className="h-4 w-4" />
                  </button>
                  <MessageSquare className="h-4 w-4 text-meta-muted flex-shrink-0 mt-1" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <div className="text-sm font-medium text-meta-light truncate">{sender}</div>
                      <div className="text-xs text-meta-muted flex-shrink-0">
                        {createdDate}
                      </div>
                    </div>
                    <div className="text-xs text-meta-muted mb-1">
                      {item.conversation.type === 'dm' && 'Direct Message'}
                      {item.conversation.type === 'group' && `Group: ${conversationTitle}`}
                      {item.conversation.type === 'announcement' && `Announcement: ${conversationTitle}`}
                    </div>
                    <div className="text-sm text-meta-foreground/80 line-clamp-2">{messagePreview}</div>
                    <div className="text-xs text-meta-muted/70 mt-1">
                      Archived {archivedDate}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
