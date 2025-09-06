"use client"

import { useEffect, useMemo, useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase/client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { DataTable } from '@/components/ui/data-table'
import { createConversationColumns, ConversationRow } from '@/components/messaging/conversations-columns'
import { createDirectoryColumns, DirectoryRow } from '@/components/messaging/directory-columns'
import { createParticipantsColumns, ParticipantRow } from '@/components/messaging/participants-columns'
import { MessageSquare, Megaphone } from 'lucide-react'

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
  const [directory, setDirectory] = useState<DirectoryRow[]>([])
  const [composeOpen, setComposeOpen] = useState(false)
  const [selectedRecipient, setSelectedRecipient] = useState<string>('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [participantsOpen, setParticipantsOpen] = useState(false)
  const [participants, setParticipants] = useState<{ user_id: string; first_name?: string; last_name?: string; email?: string }[]>([])
  const [admins, setAdmins] = useState<{ id: string; first_name?: string; last_name?: string; email?: string }[]>([])
  const [me, setMe] = useState<{ id: string; first_name?: string | null; last_name?: string | null; email?: string | null } | null>(null)
  // Group compose helpers (used by Start group from this and Admin New)
  const [composeRecipients, setComposeRecipients] = useState<Record<string, boolean>>({})
  const [composeTitle, setComposeTitle] = useState<string>('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerMode, setComposerMode] = useState<'dm'|'group'|'announcement'|'reply'>('dm')
  const [composerSubject, setComposerSubject] = useState('')
  const [composerBody, setComposerBody] = useState('')
  const [composerPreview, setComposerPreview] = useState(false)
  const [composerTarget, setComposerTarget] = useState<string>('') // for DM single target
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    for (const file of Array.from(files)) {
      try {
        const form = new FormData()
        form.append('file', file)
        const res = await fetch('/api/messaging/upload', { method: 'POST', body: form })
        if (!res.ok) continue
        const json = await res.json()
        const path = json.path as string
        const ct = (json.contentType as string) || file.type
        const name = json.name || file.name
        const signedRoute = `/api/messaging/file?path=${encodeURIComponent(path)}`
        const snippet = ct?.startsWith('image/') ? `\n![${name}](${signedRoute})\n` : `\n[${name}](${signedRoute})\n`
        setComposerBody(prev => prev + snippet)
      } catch {}
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // No inline markdown toolbar; composer handles formatting

  const fetchConversations = async () => {
    const res = await fetch('/api/messaging/conversations')
    if (res.ok) {
      const json = await res.json()
      const normalized = (json.conversations || []).map((c: any) => ({
        ...c,
        unread_count: Math.max(0, Number(c.unread_count ?? 0))
      }))
      setConversations(normalized)
      // Do not auto-select; wait for explicit user click
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
  useEffect(() => {
    if (!selectedId) return
    // Optimistically clear unread locally for snappier UI
    setConversations(prev => prev.map(c => c.id === selectedId ? { ...c, unread_count: 0 } : c))
    fetchMessages(selectedId).then(async () => {
      const res = await fetch(`/api/messaging/conversations/${selectedId}/read`, { method: 'POST' })
      if (res.ok) {
        await fetchConversations()
        window.dispatchEvent(new CustomEvent('unread-refresh'))
      }
    })
  }, [selectedId])
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
      const { data: profile } = await supabase.from('profiles').select('first_name,last_name,email,role').eq('id', user.id).single()
      setIsAdmin(profile?.role === 'admin')
      setMe({ id: user.id, first_name: (profile as any)?.first_name ?? null, last_name: (profile as any)?.last_name ?? null, email: (profile as any)?.email ?? null })
    }
    checkAdmin()
  }, [])

  // Build a quick map from user id -> display name for rendering senders
  const userNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const u of directory) {
      const name = u.name?.trim() || u.email || ''
      if (u.id) map[u.id] = name
    }
    if (me?.id) {
      const full = `${(me.first_name || '') as string} ${(me.last_name || '') as string}`.trim()
      map[me.id] = (full.length > 0 ? full : (me.email || 'Me')) as string
    }
    return map
  }, [directory, me])

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

  const createDMFromId = async (id: string) => {
    setLoading(true)
    try {
      const res = await fetch('/api/messaging/conversations/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id }),
      })
      if (res.ok) {
        const json = await res.json()
        setComposeOpen(false)
        await fetchConversations()
        setSelectedId(json.conversationId)
      }
    } finally {
      setLoading(false)
    }
  }

  // Broadcast handled by unified composer

  // Unified composer send handler
  const sendFromComposer = async () => {
    setLoading(true)
    try {
      if (composerMode === 'reply') {
        if (!selectedId) return
        await fetch(`/api/messaging/conversations/${selectedId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: composerBody }) })
        await fetchMessages(selectedId)
        await fetchConversations()
        setComposerOpen(false)
        setComposerBody('')
        return
      }

      if (composerMode === 'announcement') {
        const res = await fetch('/api/messaging/announcements/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: composerSubject, body: composerBody }) })
        if (res.ok) {
          const json = await res.json()
          await fetchConversations()
          setSelectedId(json.conversationId)
          await fetchMessages(json.conversationId)
          setComposerOpen(false)
          setComposerBody('')
        }
        return
      }

      if (composerMode === 'dm') {
        const res = await fetch('/api/messaging/conversations/dm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: composerTarget, title: composerSubject }) })
        if (res.ok) {
          const json = await res.json()
          await fetch(`/api/messaging/conversations/${json.conversationId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: composerBody }) })
          await fetchConversations()
          setSelectedId(json.conversationId)
          await fetchMessages(json.conversationId)
          setComposerOpen(false)
          setComposerBody('')
        }
        return
      }

      if (composerMode === 'group') {
        const ids = Object.entries(composeRecipients).filter(([, v]) => v).map(([id]) => id)
        const res = await fetch('/api/messaging/conversations/group', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userIds: ids, title: composerSubject }) })
        if (res.ok) {
          const json = await res.json()
          await fetch(`/api/messaging/conversations/${json.conversationId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: composerBody }) })
          await fetchConversations()
          setSelectedId(json.conversationId)
          await fetchMessages(json.conversationId)
          setComposerOpen(false)
          setComposerBody('')
        }
        return
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
    if (!selectedId) return
    // Open composer for DM to author with editable subject
    const conv = conversations.find(c => c.id === selectedId)
    let targetId: string | undefined = conv?.created_by
    if (!targetId && admins[0]) targetId = admins[0].id
    if (!targetId) return
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.id === targetId && admins[0]) targetId = admins[0].id
    setComposerMode('dm')
    setComposerSubject(`Re: ${conv?.title || 'Message'}`)
    setComposerBody('')
    setComposerTarget(targetId!)
    setComposerPreview(false)
    setComposerOpen(true)
  }

  const startAdminGroup = async () => {
    const ids = Object.entries(composeRecipients).filter(([, v]) => v).map(([id]) => id)
    if (ids.length === 0) return
    setLoading(true)
    try {
      const res = await fetch('/api/messaging/conversations/group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: ids, title: composeTitle || undefined }),
      })
      if (res.ok) {
        const json = await res.json()
        setComposeOpen(false)
        setComposeRecipients({})
        setComposeTitle('')
        await fetchConversations()
        setSelectedId(json.conversationId)
      }
    } finally {
      setLoading(false)
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

  // Realtime: subscribe to messages to refresh lists in real-time
  useEffect(() => {
    const channel = supabase.channel('messages-page')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async () => {
        await fetchConversations()
        if (selectedId) await fetchMessages(selectedId)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members' }, async () => {
        await fetchConversations()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedId])

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 lg:col-span-4 border border-meta-border rounded-md overflow-hidden">
        <div className="p-3 font-medium bg-meta-card flex items-center justify-between">
          <span>Conversations</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => { setComposerMode(isAdmin ? 'group' : 'dm'); setComposerSubject(''); setComposerBody(''); setComposerPreview(false); setComposerTarget(''); setComposeRecipients({}); setComposerOpen(true) }} title={isAdmin ? 'New group or DM' : 'New DM'}>
              <MessageSquare className="h-4 w-4" />
            </Button>
            {isAdmin && (
              <Button size="sm" variant="secondary" onClick={() => { setComposerMode('announcement'); setComposerSubject(''); setComposerBody(''); setComposerPreview(false); setComposerOpen(true) }} title="New announcement">
                <Megaphone className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        {/* Admin Tools removed per updated design */}
        <div className="p-3">
          <DataTable
            columns={createConversationColumns(
              (id) => setSelectedId(id),
              async () => { await replyPrivately() },
              isAdmin
            )}
            data={conversations as ConversationRow[]}
            onRowClick={(row) => setSelectedId((row as any).id)}
          />
        </div>
      </div>

      <div className="col-span-12 lg:col-span-8 border border-meta-border rounded-md flex flex-col min-h-[60vh]">
        <div className="p-3 font-medium bg-meta-card flex items-center justify-between">
          <span>Messages</span>
          <div className="ml-auto">
            <Button size="sm" variant="secondary" onClick={startGroupFromSelected} disabled={!selectedId}>Start group from this</Button>
            {(selectedId && ((conversations.find(c => c.id === selectedId)?.type !== 'announcement') || isAdmin)) && (
              <Button size="sm" className="ml-2" onClick={() => { setComposerMode('reply'); setComposerSubject(''); setComposerBody(''); setComposerPreview(false); setComposerOpen(true) }}>Reply</Button>
            )}
            {!isAdmin && (conversations.find(c => c.id === selectedId)?.type === 'announcement') && (
              <Button size="sm" className="ml-2" onClick={replyPrivately}>Reply privately</Button>
            )}
            {isAdmin && (conversations.find(c => c.id === selectedId)?.type !== 'dm') && (
              <Button size="sm" variant="ghost" className="ml-2" onClick={async () => { setParticipantsOpen(v => !v); if (!participantsOpen) await loadParticipants() }} disabled={!selectedId}>
                {participantsOpen ? 'Hide participants' : 'Show participants'}
              </Button>
            )}
          </div>
        </div>
        {isAdmin && participantsOpen && (
          <div className="p-3 border-b border-meta-border space-y-2 bg-meta-dark/40">
            <div className="text-sm font-medium text-meta-light">Participants</div>
            <DataTable columns={createParticipantsColumns(muteUser)} data={participants as ParticipantRow[]} />
          </div>
        )}
        {/* Inline broadcast removed; unified composer handles all composing */}
        <div className="flex-1 p-4 space-y-3 overflow-auto">
          {messages.map(m => (
            <div key={m.id} className="text-sm">
              <div className="text-meta-muted text-xs">
                <span className="font-medium text-meta-light">{userNameMap[m.sender_id] || 'Unknown'}</span>
                <span className="mx-1">•</span>
                {new Date(m.created_at).toLocaleString()}
              </div>
              <div className="prose prose-invert max-w-none text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.body}</ReactMarkdown>
              </div>
            </div>
          ))}
          {messages.length === 0 && (
            <div className="text-sm text-meta-muted">No messages yet</div>
          )}
        </div>
        {/* Inline reply removed; use modal composer */}
      </div>
      {/* Unified Composer Modal */}
      <Dialog open={composerOpen} onOpenChange={(v) => setComposerOpen(v)}>
        <DialogContent onEscapeKeyDown={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()} className={composerMode === 'announcement' ? 'sm:max-w-[75vw]' : undefined}>
          <DialogHeader>
            <DialogTitle>
              {composerMode === 'announcement' ? 'New Announcement' : composerMode === 'group' ? 'New Group Message' : composerMode === 'dm' ? 'New Direct Message' : 'Reply'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {composerMode !== 'reply' && (
              <Input placeholder="Subject" value={composerSubject} onChange={(e) => setComposerSubject(e.target.value)} />
            )}
            {composerMode === 'reply' && (
              <Input value={conversations.find(c => c.id === selectedId)?.title || ''} readOnly />
            )}
            {(composerMode === 'dm' || composerMode === 'group') && (
              <div className="max-h-52 overflow-auto border border-meta-border rounded">
                {directory.map((u) => (
                  <label key={u.id} className="flex items-center gap-3 p-2 border-b border-meta-border last:border-b-0 cursor-pointer">
                    {composerMode === 'group' ? (
                      <input type="checkbox" className="accent-blue-600" checked={!!composeRecipients[u.id]} onChange={(e) => setComposeRecipients(prev => ({ ...prev, [u.id]: e.target.checked }))} />
                    ) : (
                      <input type="radio" name="dm-target" className="accent-blue-600" checked={composerTarget === u.id} onChange={() => setComposerTarget(u.id)} />
                    )}
                    <div className="flex-1">
                      <div className="text-sm">{u.name}</div>
                      <div className="text-xs text-meta-muted">{u.email} · {u.role}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2 text-xs">
              <Button variant="secondary" size="sm" onClick={() => setComposerBody(prev => prev + (prev.endsWith(' ') || prev.length === 0 ? '' : ' ') + '**bold** ')}>Bold</Button>
              <Button variant="secondary" size="sm" onClick={() => setComposerBody(prev => prev + (prev.endsWith(' ') || prev.length === 0 ? '' : ' ') + '*italic* ')}>Italic</Button>
              <Button variant="secondary" size="sm" onClick={() => setComposerBody(prev => prev + (prev.endsWith(' ') || prev.length === 0 ? '' : ' ') + '[title](https://example.com) ')}>Link</Button>
              <Button variant="secondary" size="sm" onClick={() => setComposerBody(prev => prev + '\n- item\n- item\n')}>Bulleted</Button>
              <Button variant="secondary" size="sm" onClick={() => setComposerBody(prev => prev + '\n1. item\n2. item\n')}>Numbered</Button>
              <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => handleFilesSelected(e.target.files)} />
              <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>Attach</Button>
              <label className="ml-auto text-xs flex items-center gap-2">
                <input type="checkbox" checked={composerPreview} onChange={(e) => setComposerPreview(e.target.checked)} /> Preview
              </label>
            </div>
            <textarea className={`w-full ${composerMode === 'announcement' ? 'h-[60vh]' : 'h-40'} rounded-md border border-meta-border bg-meta-dark text-meta-light p-2 text-sm`} placeholder="Write your message" value={composerBody} onChange={(e) => setComposerBody(e.target.value)} />
            {composerPreview && (
              <div className="border border-meta-border rounded-md p-3 bg-meta-card">
                <div className="text-xs text-meta-muted mb-2">Preview</div>
                <div className="prose prose-invert max-w-none text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{composerBody}</ReactMarkdown>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setComposerOpen(false)}>Cancel</Button>
              <Button onClick={async () => { await sendFromComposer() }} disabled={loading || (composerMode !== 'reply' && composerSubject.trim().length === 0) || (composerMode === 'dm' && !composerTarget) || (composerMode === 'group' && Object.values(composeRecipients).every(v => !v)) || composerBody.trim().length === 0}>Send</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
