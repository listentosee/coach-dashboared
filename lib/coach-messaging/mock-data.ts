import type { CoachConversation, CoachMessage, MessagingSnapshot } from './types'

const now = new Date()
const iso = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000).toISOString()

const conversations: CoachConversation[] = [
  {
    id: 'conv-1',
    type: 'group',
    title: 'Varsity Swim Team',
    created_at: iso(720),
    last_message_at: iso(5),
    unread_count: 2,
    created_by: 'coach-1',
  },
  {
    id: 'conv-2',
    type: 'announcement',
    title: 'Weekly Bulletin',
    created_at: iso(1440),
    last_message_at: iso(60),
    created_by: 'coach-1',
  },
  {
    id: 'conv-3',
    type: 'dm',
    title: null,
    created_at: iso(2880),
    last_message_at: iso(15),
    unread_count: 0,
    created_by: 'player-4',
  },
]

const messagesByConversation: Record<string, CoachMessage[]> = {
  'conv-1': [
  {
      id: '1',
      conversation_id: 'conv-1',
      sender_id: 'coach-1',
      body: 'Practice plan for today. Please arrive 15 minutes early.',
      created_at: iso(90),
      parent_message_id: null,
      sender_name: 'Alex Coach',
      read_at: iso(89),
    },
    {
      id: '2',
      conversation_id: 'conv-1',
      sender_id: 'player-1',
      body: 'Got it, Coach! Will the warm-up be in lane assignments?',
      created_at: iso(85),
      parent_message_id: '1',
      sender_name: 'Jamie Swimmer',
      read_at: null,
    },
    {
      id: '3',
      conversation_id: 'conv-1',
      sender_id: 'coach-1',
      body: 'Yes—lane assignments posted on the board.',
      created_at: iso(80),
      parent_message_id: '1',
      sender_name: 'Alex Coach',
      read_at: iso(79),
    },
    {
      id: '4',
      conversation_id: 'conv-1',
      sender_id: 'player-2',
      body: 'I will be five minutes late.',
      created_at: iso(40),
      parent_message_id: null,
      sender_name: 'Sam Relay',
      read_at: null,
    },
  ],
  'conv-2': [
    {
      id: '11',
      conversation_id: 'conv-2',
      sender_id: 'coach-1',
      body: 'Reminder: team breakfast Friday at 7am.',
      created_at: iso(180),
      parent_message_id: null,
      sender_name: 'Alex Coach',
      read_at: iso(179),
    },
    {
      id: '12',
      conversation_id: 'conv-2',
      sender_id: 'coach-1',
      body: 'Please RSVP by Wednesday.',
      created_at: iso(170),
      parent_message_id: '11',
      sender_name: 'Alex Coach',
      read_at: iso(169),
    },
    {
      id: '13',
      conversation_id: 'conv-2',
      sender_id: 'player-3',
      body: 'I will be there! Bringing bagels.',
      created_at: iso(160),
      parent_message_id: '11',
      sender_name: 'Taylor Sprint',
      read_at: null,
    },
    {
      id: '14',
      conversation_id: 'conv-2',
      sender_id: 'coach-1',
      body: 'Thanks, Taylor. Looking forward to it.',
      created_at: iso(150),
      parent_message_id: '11',
      sender_name: 'Alex Coach',
      read_at: iso(149),
    },
  ],
  'conv-3': [
    {
      id: '21',
      conversation_id: 'conv-3',
      sender_id: 'player-4',
      body: 'Can we review my stroke mechanics tomorrow?',
      created_at: iso(45),
      parent_message_id: null,
      sender_name: 'Morgan Lane',
      read_at: null,
    },
    {
      id: '22',
      conversation_id: 'conv-3',
      sender_id: 'coach-1',
      body: 'Absolutely, we will set aside ten minutes before practice.',
      created_at: iso(30),
      parent_message_id: '21',
      sender_name: 'Alex Coach',
      read_at: iso(29),
    },
  ],
}

export const mockSnapshot: MessagingSnapshot = {
  conversations,
  messagesByConversation,
}

export function cloneMockSnapshot(): MessagingSnapshot {
  return {
    conversations: conversations.map((c) => ({ ...c })),
    messagesByConversation: Object.fromEntries(
      Object.entries(messagesByConversation).map(([id, arr]) => [
        id,
        arr.map((m) => ({ ...m })),
      ]),
    ),
  }
}
