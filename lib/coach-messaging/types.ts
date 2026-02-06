export type CoachConversation = {
  id: string
  type: 'dm' | 'group' | 'announcement'
  title: string | null
  created_by?: string | null
  created_at: string
  unread_count?: number | null
  last_message_at?: string | null
  display_title?: string | null
  pinned?: boolean
  pinned_at?: string | null
  archived_at?: string | null
  last_message_body?: string | null
  last_sender_name?: string | null
  last_sender_email?: string | null
}

export type CoachMessage = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
  parent_message_id: string | null
  sender_name?: string | null
  sender_email?: string | null
  read_at?: string | null
  flagged?: boolean
  archived_at?: string | null
  high_priority?: boolean
}

export type CoachDirectoryUser = {
  id: string
  displayName: string
  email?: string | null
}

export type ThreadGroup = {
  rootId: string
  subject: string | null
  messages: CoachMessage[]
  lastActivityAt: string
}

export type ThreadSummary = {
  conversation_id: string
  root_id: string
  sender_id: string
  created_at: string
  snippet: string
  reply_count: number
  last_reply_at: string | null
  unread_count: number
}

export type MessagingSnapshot = {
  conversations: CoachConversation[]
  messagesByConversation: Record<string, CoachMessage[]>
}

export type CoachMessagingDataSource = () => Promise<MessagingSnapshot>
