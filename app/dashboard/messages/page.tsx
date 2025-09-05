"use client"

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { supabase } from '@/lib/supabase/client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type Conversation = {
  id: string
  type: 'dm' | 'announcement'
  title: string | null
  created_by?: string
  created_at: string
  unread_count?: number
}

type Message = {
  id: number
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
}

export default function MessagesPage() {
  const [loading, setLoading] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [directory, setDirectory] = useState<{ id: string; name: string; email: string; role?: string }[]>([])
  const [composeOpen, setComposeOpen] = useState(false)
  const [selectedRecipient, setSelectedRecipient] = useState<string>('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [broadcastBody, setBroadcastBody] = useState('')
  const [adminToolsOpen, setAdminToolsOpen] = useState(false)
  const [coachFilter, setCoachFilter] = useState('')
  const [participantsOpen, setParticipantsOpen] = useState(false)
  const [participants, setParticipants] = useState<{ user_id: string; first_name?: string; last_name?: string; email?: string }[]>([])
  const [admins, setAdmins] = useState<{ id: string; first_name?: string; last_name?: string; email?: string }[]>([])

  // Markdown helpers for admin broadcast toolbar
  const mdInsert = (syntax: 'bold'|'italic'|'link'|'ul'|'ol') => {
    setBroadcastBody(prev => {
      if (syntax === 'bold') return prev + (prev.endsWith(' ') || prev.length === 0 ? '' : ' ') + '**bold** '
      if (syntax === 'italic') return prev + (prev.endsWith(' ') || prev.length === 0 ? '' : ' ') + '*italic* '
      if (syntax === 'link') return prev + (prev.endsWith(' ') || prev.length === 0 ? '' : ' ') + '[title](https://example.com) '
      if (syntax === 'ul') return prev + '\n- item\n- item\n'
      if (syntax === 'ol') return prev + '\n1. item\n2. item\n'
      return prev
    })
  }

  const fetchConversations = async () => {
    const res = await fetch('/api/messaging/conversations')
    if (res.ok) {
      const json = await res.json()
      setConversations(json.conversations || [])
      if (!selectedId && json.conversations?.length > 0) {
        setSelectedId(json.conversations[0].id)
      }
    }
  }

  const fetchMessages = async (id: string) => {
    const res = await fetch(`/api/messaging/conversations/${id}/messages?limit=200`)
    if (res.ok) {
      const json = await res.json()
      setMessages(json.messages || [])
    } else {
      setMessages([])
    }
  }

  useEffect(() => { fetchConversations() }, [])
  useEffect(() => { if (selectedId) { fetchMessages(selectedId).then(async () => { await fetch(`/api/messaging/conversations/${selectedId}/read`, { method: 'POST' }); await fetchConversations(); window.dispatchEvent(new CustomEvent('unread-refresh')) }) } }, [selectedId])
  useEffect(() => {
    const loadDir = async () => {
      const res = await fetch('/api/users/directory')
      if (res.ok) {
        const json = await res.json()
        setDirectory((json.users || []).map((u: any) => ({ id: u.id, name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email, email: u.email, role: u.role })))
      }
    }
    loadDir()
  }, [])
  useEffect(() => {
    const loadAdmins = async () => {
      const res = await fetch('/api/users/admins')
      if (res.ok) {
        const json = await res.json()
        setAdmins(json.admins || [])
      }
    }
    loadAdmins()
  }, [])
  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setIsAdmin(profile?.role === 'admin')
    }
    checkAdmin()
  }, [])

  const send = async () => {
    const selected = conversations.find(c => c.id === selectedId)
    if (!selectedId || newMessage.trim().length === 0) return
    if (selected && selected.type === 'announcement' && !isAdmin) {
      // Prevent RLS error by blocking sends to announcements for non-admin
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/messaging/conversations/${selectedId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: newMessage }),
      })
      if (res.ok) {
        setNewMessage('')
        await fetchMessages(selectedId)
      }
    } finally {
      setLoading(false)
    }
  }

  const createDM = async () => {
    if (!selectedRecipient) return
    setLoading(true)
    try {
      const res = await fetch('/api/messaging/conversations/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedRecipient }),
      })
      if (res.ok) {
        const json = await res.json()
        setComposeOpen(false)
        setSelectedRecipient('')
        await fetchConversations()
        setSelectedId(json.conversationId)
      }
    } finally {
      setLoading(false)
    }
  }

  const sendBroadcast = async () => {
    if (!isAdmin || broadcastBody.trim().length === 0) return
    setLoading(true)
    try {
      const res = await fetch('/api/messaging/announcements/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: broadcastBody }),
      })
      if (res.ok) {
        setBroadcastBody('')
        await fetchConversations()
      }
    } finally {
      setLoading(false)
    }
  }

  // Start group from selected conversation: preselect members (excluding current user)
  const startGroupFromSelected = async () => {
    if (!selectedId) return
    try {
      const res = await fetch(`/api/messaging/conversations/${selectedId}/members`)
      if (!res.ok) return
      const json = await res.json()
      const { data: { user } } = await supabase.auth.getUser()
      const me = user?.id
      const pre: Record<string, boolean> = {}
      for (const m of json.members || []) {
        if (m.user_id !== me) pre[m.user_id] = true
      }
      setComposeRecipients(pre)
      setComposeTitle('')
      setComposeOpen(true)
    } catch {}
  }

  const replyPrivately = async () => {
    // Open DM to the first admin
    const admin = admins[0]
    if (!admin) return
    const res = await fetch('/api/messaging/conversations/dm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: admin.id }) })
    if (res.ok) {
      const json = await res.json()
      await fetchConversations()
      setSelectedId(json.conversationId)
    }
  }

  const loadParticipants = async () => {
    if (!selectedId) return
    const res = await fetch(`/api/messaging/conversations/${selectedId}/members`)
    if (res.ok) {
      const json = await res.json()
      setParticipants(json.members || [])
    }
  }

  const muteUser = async (userId: string, minutes: number | null) => {
    if (!selectedId) return
    await fetch(`/api/messaging/conversations/${selectedId}/mute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, minutes: minutes || undefined, until: minutes === null ? null : undefined }),
    })
    await loadParticipants()
  }

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 lg:col-span-3 border border-meta-border rounded-md overflow-hidden">
        <div className="p-3 font-medium bg-meta-card flex items-center justify-between">
          <span>Conversations</span>
          <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="secondary">New</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Direct Message</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="max-h-64 overflow-auto border border-meta-border rounded-md p-2 space-y-1">
                  {directory.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 py-1">
                      <input type="radio" name="recipient" checked={selectedRecipient === u.id} onChange={() => setSelectedRecipient(u.id)} />
                      <span className="text-sm">{u.name} <span className="text-meta-muted">{u.email}</span></span>
                      <span className="ml-auto text-xs text-meta-muted">{u.role}</span>
                    </label>
                  ))}
                  {directory.length === 0 && (
                    <div className="text-sm text-meta-muted">No users found</div>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setComposeOpen(false)}>Cancel</Button>
                  <Button onClick={createDM} disabled={loading || !selectedRecipient}>Start DM</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        {isAdmin && (
          <div className="p-3 border-b border-meta-border space-y-2 bg-meta-dark/40">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-meta-light">Admin Tools</div>
              <Button size="sm" variant="ghost" onClick={() => setAdminToolsOpen(v => !v)}>{adminToolsOpen ? 'Hide' : 'Show'}</Button>
            </div>
            {adminToolsOpen && (
              <div className="space-y-2">
                <Input placeholder="Search coaches" value={coachFilter} onChange={e => setCoachFilter(e.target.value)} />
                <div className="max-h-48 overflow-auto divide-y divide-meta-border border border-meta-border rounded-md">
                  {coaches
                    .filter(c => (c.name + ' ' + c.email).toLowerCase().includes(coachFilter.toLowerCase()))
                    .map(c => (
                      <div key={c.id} className="p-2 flex items-center justify-between">
                        <div className="text-sm">{c.name} <span className="text-meta-muted">{c.email}</span></div>
                        <Button size="sm" onClick={async () => {
                          const res = await fetch('/api/messaging/conversations/dm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: c.id }) })
                          if (res.ok) {
                            const json = await res.json()
                            await fetchConversations()
                            setSelectedId(json.conversationId)
                          }
                        }}>Open DM</Button>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
        <div className="divide-y divide-meta-border">
          {conversations.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`w-full text-left p-3 hover:bg-meta-accent/20 ${selectedId === c.id ? 'bg-meta-accent/30' : ''}`}
            >
              <div className="text-sm text-meta-light flex items-center">
                <span>{c.type === 'announcement' ? 'Announcements' : 'Direct Message'}</span>
                {c.unread_count && c.unread_count > 0 && (
                  <span className="ml-auto inline-flex items-center justify-center rounded-full bg-red-600 text-white text-xs px-2 py-0.5">{c.unread_count}</span>
                )}
              </div>
              {c.title && <div className={`text-xs ${c.unread_count && c.unread_count > 0 ? 'text-white font-medium' : 'text-meta-muted'}`}>{c.title}</div>}
            </button>
          ))}
          {conversations.length === 0 && (
            <div className="p-3 text-sm text-meta-muted">No conversations</div>
          )}
        </div>
      </div>

      <div className="col-span-12 lg:col-span-9 border border-meta-border rounded-md flex flex-col min-h-[60vh]">
        <div className="p-3 font-medium bg-meta-card flex items-center justify-between">
          <span>Messages</span>
          {isAdmin && (
            <div className="flex items-center gap-2 text-xs text-meta-muted">
              Markdown supported
            </div>
          )}
          <div className="ml-auto">
            <Button size="sm" variant="secondary" onClick={startGroupFromSelected} disabled={!selectedId}>Start group from this</Button>
            {!isAdmin && (conversations.find(c => c.id === selectedId)?.type === 'announcement') && (
              <Button size="sm" className="ml-2" onClick={replyPrivately}>Reply privately</Button>
            )}
            {isAdmin && (
              <Button size="sm" variant="ghost" className="ml-2" onClick={async () => { setParticipantsOpen(v => !v); if (!participantsOpen) await loadParticipants() }} disabled={!selectedId}>
                {participantsOpen ? 'Hide participants' : 'Show participants'}
              </Button>
            )}
          </div>
        </div>
        {isAdmin && participantsOpen && (
          <div className="p-3 border-b border-meta-border space-y-2 bg-meta-dark/40">
            <div className="text-sm font-medium text-meta-light">Participants</div>
            <div className="space-y-1">
              {participants.map(p => (
                <div key={p.user_id} className="flex items-center justify-between text-sm">
                  <div>
                    {(p.first_name || p.last_name) ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : p.email}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => muteUser(p.user_id, 60)}>Mute 60m</Button>
                    <Button size="sm" variant="ghost" onClick={() => muteUser(p.user_id, null)}>Unmute</Button>
                  </div>
                </div>
              ))}
              {participants.length === 0 && <div className="text-sm text-meta-muted">No participants</div>}
            </div>
          </div>
        )}
        {isAdmin && (
          <div className="p-3 border-b border-meta-border space-y-2">
            <div className="text-sm font-medium text-meta-light">Broadcast to all coaches</div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Button variant="secondary" size="sm" onClick={() => mdInsert('bold')}>Bold</Button>
              <Button variant="secondary" size="sm" onClick={() => mdInsert('italic')}>Italic</Button>
              <Button variant="secondary" size="sm" onClick={() => mdInsert('link')}>Link</Button>
              <Button variant="secondary" size="sm" onClick={() => mdInsert('ul')}>Bulleted</Button>
              <Button variant="secondary" size="sm" onClick={() => mdInsert('ol')}>Numbered</Button>
            </div>
            <textarea className="w-full h-24 rounded-md border border-meta-border bg-meta-dark text-meta-light p-2 text-sm" placeholder="Write an announcement (Markdown supported)" value={broadcastBody} onChange={(e) => setBroadcastBody(e.target.value)} />
            {broadcastBody.trim().length > 0 && (
              <div className="border border-meta-border rounded-md p-3 bg-meta-card">
                <div className="text-xs text-meta-muted mb-2">Preview</div>
                <div className="prose prose-invert max-w-none text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{broadcastBody}</ReactMarkdown>
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <Button size="sm" onClick={sendBroadcast} disabled={loading || broadcastBody.trim().length === 0}>Send Broadcast</Button>
            </div>
          </div>
        )}
        <div className="flex-1 p-4 space-y-3 overflow-auto">
          {messages.map(m => (
            <div key={m.id} className="text-sm">
              <div className="text-meta-muted text-xs">{new Date(m.created_at).toLocaleString()}</div>
              <div className="prose prose-invert max-w-none text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.body}</ReactMarkdown>
              </div>
            </div>
          ))}
          {messages.length === 0 && (
            <div className="text-sm text-meta-muted">No messages yet</div>
          )}
        </div>
        <div className="p-3 border-t border-meta-border flex gap-2">
          <Input
            placeholder={(!isAdmin && conversations.find(c => c.id === selectedId)?.type === 'announcement') ? 'Announcements are read-only. Use Reply privately.' : 'Type a message'}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send() }}
            disabled={!selectedId || (!isAdmin && conversations.find(c => c.id === selectedId)?.type === 'announcement')}
          />
          <Button onClick={send} disabled={loading || !selectedId || newMessage.trim().length === 0 || (!isAdmin && conversations.find(c => c.id === selectedId)?.type === 'announcement')}>
            Send
          </Button>
        </div>
      </div>
    </div>
  )
}
