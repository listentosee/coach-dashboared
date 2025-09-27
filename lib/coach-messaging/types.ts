export type CoachConversation = {
  id: string
  type: 'dm' | 'group' | 'announcement'
  title: string | null
  created_by?: string | null
  created_at: string
  unread_count?: number | null
  last_message_at?: string | null
  display_title?: string | null
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

export type MessagingSnapshot = {
  conversations: CoachConversation[]
  messagesByConversation: Record<string, CoachMessage[]>
}

export type CoachMessagingDataSource = () => Promise<MessagingSnapshot>
