"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import MarkdownEditor from '@/components/ui/markdown-editor'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { useFeature } from '@/lib/features'
import { MessageSquare, Megaphone, Reply, Users, Maximize2 } from 'lucide-react'

type Conversation = {
  id: string
  type: 'dm' | 'group' | 'announcement'
  title: string | null
  created_by?: string
  created_at: string
  unread_count?: number
  last_message_at?: string | null
  display_title?: string | null
}

type Thread = {
  root_id: number
  sender_id: string
  created_at: string
  snippet: string
  reply_count: number
  last_reply_at: string | null
  read_count: number
  unread_count?: number
}

type ThreadMessage = {
  id: number
  sender_id: string
  body: string
  created_at: string
  parent_message_id: number | null
  sender_name?: string
  sender_email?: string
}

export default function MessagesV2Page() {
  // Feature flags
  const receiptsEnabled = useFeature('messageReadReceipts')
  const batchReadEnabled = useFeature('batchReadMarking')
  const threadingEnabled = useFeature('messageThreading')
  const receiptsGroupsOnly = useFeature('readReceiptsInGroupsOnly')

  // State
  const [loading, setLoading] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedChannel, setSelectedChannel] = useState<'dm'|'group'|'announcement'>('dm')
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [threads, setThreads] = useState<Thread[]>([])
  const [selectedThreadRoot, setSelectedThreadRoot] = useState<number | null>(null)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null)
  const [replyText, setReplyText] = useState('')
  const replyInputRef = useRef<HTMLInputElement | null>(null)
  // Composer modal state
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerMode, setComposerMode] = useState<'dm'|'group'|'announcement'|'reply'>('dm')
  const [composerBody, setComposerBody] = useState('')
  const [composerPreview, setComposerPreview] = useState(false)
  const [composerTarget, setComposerTarget] = useState<string>('')
  const [composeRecipients, setComposeRecipients] = useState<Record<string, boolean>>({})
  const [lockRecipient, setLockRecipient] = useState(false)
  const [composerSubject, setComposerSubject] = useState('')
  const [composerFromChannel, setComposerFromChannel] = useState(false)
  const [privateReply, setPrivateReply] = useState(false)
  const [privateRecipient, setPrivateRecipient] = useState<string>('')
  const composerFileInputRef = useRef<HTMLInputElement | null>(null)
  // Cache conversation members per conversation for titles in channel views
  const [convMembers, setConvMembers] = useState<Record<string, { user_id: string; first_name?: string; last_name?: string; email?: string }[]>>({})
  // Reader pop-out state
  const [readerModalOpen, setReaderModalOpen] = useState(false)
  const [readerOverflow, setReaderOverflow] = useState(false)
  const readerScrollRef = useRef<HTMLDivElement | null>(null)
  // Track whether we've applied the initial auto-channel selection
  const channelBootstrappedRef = useRef(false)

  const handleComposerFilesSelected = async (files: FileList | null) => {
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
    if (composerFileInputRef.current) composerFileInputRef.current.value = ''
  }
  const [directory, setDirectory] = useState<{ id: string; first_name?: string; last_name?: string; email?: string; role?: string }[]>([])
  const [me, setMe] = useState<{ id: string; first_name?: string | null; last_name?: string | null; email?: string | null; role?: string | null } | null>(null)

  // Read receipts support
  const observerRef = useRef<IntersectionObserver | null>(null)
  const visibleIdsRef = useRef<Set<number>>(new Set())
  const nodesRef = useRef<Record<number, HTMLElement | null>>({})
  const [readStatus, setReadStatus] = useState<Record<number, { read_count: number; readers: { first_name?: string; last_name?: string; user_id: string; read_at: string }[] }>>({})

  // Helpers
  const userNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const u of directory) {
      const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || ''
      if (u.id) map[u.id] = name
    }
    if (me?.id) {
      const self = `${(me.first_name || '') as string} ${(me.last_name || '') as string}`.trim()
      map[me.id] = (self || me.email || 'Me') as string
    }
    return map
  }, [directory, me])

  const isAdmin = (me?.role || '') === 'admin'
  const selectedConversation = conversations.find(c => c.id === selectedConversationId)
  const isAnnouncement = selectedConversation?.type === 'announcement'
  const conversationsByChannel = useMemo(() => {
    const map: Record<'dm'|'group'|'announcement', Conversation[]> = { dm: [], group: [], announcement: [] }
    for (const c of conversations) map[c.type as 'dm'|'group'|'announcement'].push(c)
    return map
  }, [conversations])
  const unreadByChannel = useMemo(() => ({
    dm: (conversationsByChannel.dm || []).reduce((a,c)=>a+(c.unread_count||0),0),
    group: (conversationsByChannel.group || []).reduce((a,c)=>a+(c.unread_count||0),0),
    announcement: (conversationsByChannel.announcement || []).reduce((a,c)=>a+(c.unread_count||0),0),
  }), [conversationsByChannel])

  const displayTitleForConversation = (c: Conversation): string => {
    if ((c.display_title || '').trim()) return (c.display_title as string)
    if (c.type === 'announcement') return c.title || 'Announcement'
    const members = convMembers[c.id] || []
    if (c.type === 'dm') {
      const other = members.find(m => m.user_id !== me?.id)
      const n = other ? `${other.first_name||''} ${other.last_name||''}`.trim() || other.email || 'Direct Message' : 'Direct Message'
      return n
    }
    const names = members.filter(m => m.user_id !== me?.id).map(m => `${m.first_name||''} ${m.last_name||''}`.trim() || m.email || 'Member')
    if (c.title && c.title.trim()) return c.title
    return names.length ? names.join(', ') : 'Group Conversation'
  }

  // Data loaders
  const fetchConversations = async () => {
    const res = await fetch('/api/messaging/conversations')
    if (res.ok) {
      const json = await res.json()
      const list: Conversation[] = json.conversations || []
      setConversations(list)
      // Only set the default channel once on initial load
      if (!channelBootstrappedRef.current && list.length > 0) {
        const latest = [...list].sort((a,b) => new Date(b.last_message_at || b.created_at).getTime() - new Date(a.last_message_at || a.created_at).getTime())[0]
        if (latest?.type) setSelectedChannel(latest.type)
        channelBootstrappedRef.current = true
      }
    }
  }

  const fetchThreads = async (conversationId: string): Promise<Thread[]> => {
    const res = await fetch(`/api/messaging/conversations/${conversationId}/threads?limit=200`)
    if (res.ok) {
      const json = await res.json()
      const list: Thread[] = json.threads || []
      setThreads(list)
      return list
    }
    setThreads([])
    return []
  }

  const fetchThreadMessages = async (rootId: number) => {
    const res = await fetch(`/api/messaging/threads/${rootId}`)
    if (res.ok) {
      const json = await res.json()
      const rows: ThreadMessage[] = json.messages || []
      setMessages(rows)
      setSelectedMessageId(rootId)
      // Always load read status for message-level indicators
      const ids = rows.map((m) => m.id).slice(-200)
      if (ids.length > 0) await loadReadStatus(ids)
    } else {
      setMessages([])
    }
  }

  const loadDirectory = async () => {
    // Reuse directory endpoints from the app
    const res = await fetch('/api/users/directory')
    if (res.ok) {
      const { users } = await res.json()
      setDirectory(users || [])
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('first_name,last_name,email,role').eq('id', user.id).single()
      setMe({ id: user.id, first_name: (profile as any)?.first_name ?? null, last_name: (profile as any)?.last_name ?? null, email: (profile as any)?.email ?? null, role: (profile as any)?.role ?? null })
    }
  }

  // Read status loader
  const loadReadStatus = async (ids: number[]) => {
    try {
      const res = await fetch(`/api/messaging/read-receipts?messageIds=${ids.join(',')}`)
      if (res.ok) {
        const { readStatus: rows } = await res.json()
        const map: typeof readStatus = {}
        for (const row of rows || []) {
          map[row.message_id] = { read_count: row.read_count || 0, readers: row.readers || [] }
        }
        setReadStatus(prev => ({ ...prev, ...map }))
      }
    } catch {}
  }

  // No viewport-based read marking anymore; reads are explicit on leave
  const setMsgRef = (_id: number) => (_el: HTMLElement | null) => {}

  // Effects
  useEffect(() => { loadDirectory(); fetchConversations() }, [])

  // Prefetch members for conversations when display_title is not available (fallback)
  useEffect(() => {
    const run = async () => {
      if (!me?.id) return
      const inChan = conversations.filter(c => c.type === selectedChannel && !c.display_title)
      const missing = inChan.filter(c => !convMembers[c.id])
      if (missing.length === 0) return
      const entries: [string, any[]][] = []
      await Promise.all(missing.map(async (c) => {
        try {
          const r = await fetch(`/api/messaging/conversations/${c.id}/members`)
          if (r.ok) {
            const { members } = await r.json()
            entries.push([c.id, members || []])
          }
        } catch {}
      }))
      if (entries.length) setConvMembers(prev => ({ ...prev, ...Object.fromEntries(entries) }))
    }
    run()
  }, [selectedChannel, conversations, me])

  useEffect(() => {
    if (!selectedConversationId) return
    ;(async () => {
      const list = await fetchThreads(selectedConversationId)
      const first = list[0]?.root_id
      if (typeof first === 'number') {
        setSelectedThreadRoot(first)
        await fetchThreadMessages(first)
      } else {
        setSelectedThreadRoot(null)
        setMessages([])
      }
    })()
  }, [selectedConversationId])

  // When channel changes, ensure a conversation in that channel is selected
  useEffect(() => {
    const list = conversations.filter(c => c.type === selectedChannel)
    if (list.length === 0) {
      setSelectedConversationId(null)
      setThreads([])
      setMessages([])
      setSelectedThreadRoot(null)
      setSelectedMessageId(null)
      return
    }
    if (!selectedConversationId || !list.find(c => c.id === selectedConversationId)) {
      setSelectedConversationId(list[0].id)
    }
  }, [selectedChannel, conversations])

  // Remove auto-read by focus/visibility

  useEffect(() => {
    // Realtime: thread messages of current thread
    if (!selectedConversationId || !selectedThreadRoot) return
    const channel = supabase
      .channel(`msgs-${selectedConversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedConversationId}` }, async (payload) => {
        const row: any = payload.new
        // Only update if the new message is in the selected thread
        if (row.thread_root_id === selectedThreadRoot || row.id === selectedThreadRoot) {
          await fetchThreadMessages(selectedThreadRoot)
        }
        // Update conversations list and thread stats for unread indicators
        if (row.sender_id !== me?.id) {
          await fetchConversations()
          await fetchThreads(selectedConversationId)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [selectedConversationId, selectedThreadRoot])

  useEffect(() => {
    // Realtime: read receipts for current thread
    if (!receiptsEnabled || messages.length === 0) return
    const ids = messages.map(m => m.id)
    const filter = `message_id=in.(${ids.join(',')})`
    const channel = supabase
      .channel(`receipts-${selectedThreadRoot}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_read_receipts', filter }, async (payload) => {
        const mid = (payload.new as any)?.message_id
        if (typeof mid === 'number') await loadReadStatus([mid])
        // Receipt inserts should refresh conversation/thread unread counts for this user
        if ((payload.new as any)?.user_id === me?.id) {
          await fetchConversations()
          if (selectedConversationId) await fetchThreads(selectedConversationId)
          window.dispatchEvent(new Event('unread-refresh'))
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [receiptsEnabled, messages, selectedThreadRoot])

  // Detect reader overflow to decide if pop-out should be shown
  useEffect(() => {
    const check = () => {
      const el = readerScrollRef.current
      if (!el) { setReaderOverflow(false); return }
      // small epsilon to avoid flapping when scrollbars render
      setReaderOverflow((el.scrollHeight - el.clientHeight) > 4)
    }
    const ro = new ResizeObserver(check)
    if (readerScrollRef.current) ro.observe(readerScrollRef.current)
    const t = setTimeout(check, 50)
    window.addEventListener('resize', check)
    return () => { window.removeEventListener('resize', check); clearTimeout(t); ro.disconnect() }
  }, [messages, selectedMessageId])

  // Global receipts subscription for this user to keep channel/conversation counts fresh
  useEffect(() => {
    if (!me?.id) return
    const channel = supabase
      .channel(`receipts-self-${me.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_read_receipts', filter: `user_id=eq.${me.id}` }, async () => {
        await fetchConversations()
        if (selectedConversationId) await fetchThreads(selectedConversationId)
        window.dispatchEvent(new Event('unread-refresh'))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [me?.id, selectedConversationId])

  // Actions
  const markMessagesRead = async (ids: number[]) => {
    try {
      if (!ids || ids.length === 0) return
      await fetch('/api/messaging/read-receipts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageIds: ids })
      })
      await loadReadStatus(ids)
      // Refresh counts across the UI
      await fetchConversations()
      if (selectedConversationId) await fetchThreads(selectedConversationId)
      window.dispatchEvent(new Event('unread-refresh'))
    } catch {}
  }

  // Mark current message as read when user navigates away to another message/thread/conversation
  const prevSelectedRef = useRef<number | null>(null)
  useEffect(() => {
    const prev = prevSelectedRef.current
    if (prev && prev !== selectedMessageId) {
      markMessagesRead([prev])
    }
    prevSelectedRef.current = selectedMessageId
  }, [selectedMessageId])

  // When switching conversation, mark the current selected message read
  useEffect(() => {
    if (!selectedConversationId) return
    const current = prevSelectedRef.current
    if (current) markMessagesRead([current])
  }, [selectedConversationId])

  const sendReply = async () => {
    if (!selectedConversationId || !selectedThreadRoot) return
    const text = replyText.trim()
    if (!text) return
    if (isAnnouncement && !isAdmin) return // guard double-sends in UI
    setLoading(true)
    try {
      const res = await fetch(`/api/messaging/conversations/${selectedConversationId}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text, parentMessageId: selectedThreadRoot })
      })
      const ok = res.ok
      const data = ok ? await res.json() : null
      setReplyText('')
      await fetchThreadMessages(selectedThreadRoot)
      if (data?.id) setSelectedMessageId(Number(data.id))
    } finally {
      setLoading(false)
    }
  }

  // Send first message in an empty DM (no thread root yet)
  const sendFirstMessage = async () => {
    if (!selectedConversationId) return
    const text = replyText.trim()
    if (!text) return
    setLoading(true)
    try {
      const res = await fetch(`/api/messaging/conversations/${selectedConversationId}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text })
      })
      if (res.ok) {
        const { id } = await res.json()
        // New root created; refresh threads and select it
        const list = await fetchThreads(selectedConversationId)
        setReplyText('')
        const rootId = Number(id)
        setSelectedThreadRoot(rootId)
        await fetchThreadMessages(rootId)
        setSelectedMessageId(rootId)
      }
    } finally {
      setLoading(false)
    }
  }

  // Private reply to announcer (no user list, no subject)
  const replyPrivately = async () => {
    if (!selectedConversationId) return
    const rootSender = threads.find(t => t.root_id === selectedThreadRoot)?.sender_id
      || messages[0]?.sender_id
    if (!rootSender || rootSender === me?.id) return
    setComposerMode('reply')
    setComposerBody('')
    setComposerPreview(false)
    setComposerFromChannel(false)
    ;(setLockRecipient as any)(false)
    ;(setComposerTarget as any)('')
    ;(setComposeRecipients as any)({})
    // Mark as private and capture recipient
    ;(window as any) // noop to satisfy TS in this patch context
    setPrivateRecipient(rootSender)
    setPrivateReply(true)
    setComposerOpen(true)
  }

  // UI
  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Top row: Channels | Conversations | Messages list */}
      {/* Channels */}
      <div className="col-span-12 lg:col-span-4 border border-meta-border rounded-md overflow-hidden h-[45vh] flex flex-col">
        <div className="p-3 font-medium bg-meta-card flex items-center justify-between">
          <span>Channels</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" title="New DM"
              onClick={() => { setSelectedChannel('dm'); setComposerOpen(true); setComposerMode('dm'); setComposerBody(''); setComposerSubject(''); setComposerPreview(false); setComposerTarget(''); setComposeRecipients({}); setLockRecipient(false); setComposerFromChannel(true) }}>
              <MessageSquare className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="secondary" title="New Group"
              onClick={() => { setSelectedChannel('group'); setComposerOpen(true); setComposerMode('group'); setComposerBody(''); setComposerSubject(''); setComposerPreview(false); setComposeRecipients({}); setComposerTarget(''); setLockRecipient(false); setComposerFromChannel(true) }}>
              <Users className="h-4 w-4" />
            </Button>
            {isAdmin && (
              <Button size="sm" variant="secondary" title="New Announcement"
                onClick={() => { setSelectedChannel('announcement'); setComposerOpen(true); setComposerMode('announcement'); setComposerBody(''); setComposerSubject(''); setComposerPreview(false); setComposerFromChannel(true) }}>
                <Megaphone className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <div className="p-2 space-y-2 overflow-auto">
          {(['announcement','dm','group'] as const).map((ch) => (
            <button key={ch}
              className={`w-full text-left p-3 rounded border ${selectedChannel === ch ? 'border-blue-500 bg-blue-500/10' : 'border-meta-border bg-meta-card'}`}
              onClick={() => setSelectedChannel(ch)}
            >
              <div className="flex items-center justify-between text-xs text-meta-muted">
                <span className="uppercase flex items-center gap-2">
                  {unreadByChannel[ch] ? <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> : null}
                  {ch === 'group' ? 'GROUP CHATS' : ch === 'dm' ? 'DIRECT MESSAGES' : 'ANNOUNCEMENTS'}
                </span>
                {unreadByChannel[ch] ? <span className="text-blue-400">{unreadByChannel[ch]} unread</span> : <span />}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Conversations (filtered by selected channel) */}
      <div className="col-span-12 lg:col-span-3 border border-meta-border rounded-md overflow-hidden h-[45vh] flex flex-col">
        <div className="p-3 font-medium bg-meta-card">Conversations</div>
        <div className="p-2 space-y-2 overflow-auto">
          {conversations.filter(c => c.type === selectedChannel).map((c) => (
            <button key={c.id}
              className={`w-full text-left p-3 rounded border ${selectedConversationId === c.id ? 'border-blue-500 bg-blue-500/10' : 'border-meta-border bg-meta-card'}`}
              onClick={async () => { setSelectedConversationId(c.id) }}
              title={displayTitleForConversation(c)}
            >
              <div className="text-sm font-medium text-meta-light flex items-center gap-2">
                {c.unread_count ? <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> : null}
                <span>{displayTitleForConversation(c)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-meta-muted mt-0.5">
                <span>{new Date(c.last_message_at || c.created_at).toLocaleString()}</span>
                {c.unread_count ? <span className="text-blue-400">{c.unread_count} unread</span> : <span />}
              </div>
            </button>
          ))}
          {conversations.filter(c => c.type === selectedChannel).length === 0 && (
            <div className="text-sm text-meta-muted p-3">No conversations</div>
          )}
        </div>
      </div>

      {/* Messages list */}
      <div className="col-span-12 lg:col-span-5 border border-meta-border rounded-md overflow-hidden h-[45vh] flex flex-col">
        <div className="p-3 font-medium bg-meta-card">Messages</div>
        {/* Message list */}
        <div className="flex-1 overflow-auto">
          <div className="divide-y divide-meta-border">
            {messages.map((m) => {
              const isSelected = selectedMessageId === m.id
              const hasMeRead = !!readStatus[m.id]?.readers?.some(r => r.user_id === (me?.id || ''))
              const isUnread = !hasMeRead && m.sender_id !== (me?.id || '')
              return (
                <button
                  key={m.id}
                  ref={((el: any) => setMsgRef(m.id)(el)) as any}
                  data-message-id={m.id}
                  onClick={() => setSelectedMessageId(m.id)}
                  className={`w-full text-left p-3 ${isSelected ? 'bg-blue-500/10' : ''}`}
                  title={userNameMap[m.sender_id] || ''}
                >
                  <div className="text-xs text-meta-muted flex items-center justify-between">
                    <div className="flex items-center">
                      {isUnread ? <span className="inline-block h-2 w-2 rounded-full bg-red-500 mr-2" /> : null}
                      <span className="font-medium text-meta-light">{m.sender_name || userNameMap[m.sender_id] || 'Unknown'}</span>
                      <span className="mx-1">•</span>
                      {new Date(m.created_at).toLocaleString()}
                    </div>
                  </div>
                </button>
              )
            })}
            {messages.length === 0 && (
              <div className="text-sm text-meta-muted p-4">No messages yet</div>
            )}
          </div>
        </div>

        {/* Inline reply removed per updated UX */}
      </div>

      {/* Bottom row: full-width reading pane (resizable vertically, viewport-constrained) */}
      <div className="col-span-12 border border-meta-border rounded-md overflow-auto bg-meta-card/30 min-h-[35vh] max-h-[55vh] resize-y flex flex-col">
        {/* Reader banner actions */}
        <div className="px-4 py-2 border-b border-meta-border flex items-center justify-between bg-meta-card/60">
          <div className="text-sm text-meta-muted">Reader</div>
          <div className="flex items-center gap-2">
            {!isAdmin && isAnnouncement && (
              <Button size="sm" onClick={replyPrivately}>Reply privately</Button>
            )}
            {readerOverflow && (
              <Button size="sm" variant="secondary" onClick={() => setReaderModalOpen(true)} title="Open in pop-out">
                <Maximize2 className="h-4 w-4" />
              </Button>
            )}
            {selectedConversation && selectedConversation.type !== 'announcement' && selectedThreadRoot && (
              <Button size="sm" variant="secondary" onClick={() => { setComposerOpen(true); setComposerMode('reply'); setComposerBody(''); setComposerPreview(false); setPrivateReply(false); setPrivateRecipient('') }}>
                <Reply className="h-4 w-4 mr-1" /> Reply
              </Button>
            )}
          </div>
        </div>
        <div ref={readerScrollRef} className="flex-1 p-4 overflow-auto min-h-0">
        {(() => {
          const m = messages.find((x) => x.id === selectedMessageId) || (selectedThreadRoot ? messages.find(x => x.id === selectedThreadRoot) : undefined)
          if (!m) {
            if (selectedConversation?.type === 'dm' && (!messages || messages.length === 0)) {
              return <div className="text-sm text-meta-muted">Select a conversation, thread, or message to view</div>
            }
            return <div className="text-sm text-meta-muted">Select a conversation, thread, or message to view</div>
          }
          return (
            <div className="text-sm">
              <div className="text-xs text-meta-muted">
                <span className="font-medium text-meta-light">{m.sender_name || userNameMap[m.sender_id] || 'Unknown'}</span>
                <span className="mx-1">•</span>
                {new Date(m.created_at).toLocaleString()}
              </div>
              <div className="prose prose-invert max-w-none text-sm markdown-body mt-2">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{m.body}</ReactMarkdown>
              </div>
              {receiptsEnabled && (!receiptsGroupsOnly || (conversations.find(c => c.id === selectedConversationId)?.type === 'group')) && (
                <div className="mt-2 text-[11px] text-meta-muted">
                  {(() => {
                    const status = readStatus[m.id]
                    const names = (status?.readers || []).map((r: any) => `${r.first_name || ''} ${r.last_name || ''}`.trim()).filter(Boolean)
                    const title = names.join(', ')
                    const count = status?.read_count || 0
                    return (<span title={title}>{count > 0 ? `Seen by ${count}` : 'Not seen yet'}</span>)
                  })()}
                </div>
              )}
            </div>
          )
        })()}
        </div>
      </div>

      {/* Reader Pop-out Modal */}
      <Dialog open={readerModalOpen} onOpenChange={setReaderModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Message</DialogTitle>
          </DialogHeader>
          {(() => {
            const m = messages.find((x) => x.id === selectedMessageId) || (selectedThreadRoot ? messages.find(x => x.id === selectedThreadRoot) : undefined)
            if (!m) return <div className="text-sm text-meta-muted">No message selected</div>
            return (
              <div className="space-y-2">
                <div className="text-xs text-meta-muted">
                  <span className="font-medium text-meta-light">{m.sender_name || userNameMap[m.sender_id] || 'Unknown'}</span>
                  <span className="mx-1">•</span>
                  {new Date(m.created_at).toLocaleString()}
                </div>
                <div className="markdown-body prose prose-invert max-w-none text-sm max-h-[70vh] overflow-auto">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{m.body}</ReactMarkdown>
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Composer Modal */}
      <Dialog open={composerOpen} onOpenChange={(v) => setComposerOpen(v)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {composerMode === 'dm' ? 'New Direct Message' : composerMode === 'group' ? 'New Group Message' : composerMode === 'announcement' ? 'New Announcement' : 'Reply'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {composerMode === 'dm' ? (
              <div className="max-h-56 overflow-auto border border-meta-border rounded p-2">
                {directory.map((u) => (
                  <label key={u.id} className={`flex items-center gap-3 p-2 border-b last:border-b-0 border-meta-border ${lockRecipient && composerTarget !== u.id ? 'opacity-50 pointer-events-none' : ''}`}>
                    <input type="radio" name="dm-target" className="accent-blue-600" checked={composerTarget === u.id} onChange={() => setComposerTarget(u.id)} disabled={lockRecipient && composerTarget !== u.id} />
                    <div className="flex-1">
                      <div className="text-sm">{`${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email}</div>
                      <div className="text-xs text-meta-muted">{u.email}</div>
                    </div>
                  </label>
                ))}
              </div>
            ) : composerMode === 'group' ? (
              <div className="max-h-56 overflow-auto border border-meta-border rounded p-2">
                {directory.map((u) => (
                  <label key={u.id} className="flex items-center gap-3 p-2 border-b last:border-b-0 border-meta-border">
                    <input type="checkbox" className="accent-blue-600" checked={!!composeRecipients[u.id]} onChange={(e) => setComposeRecipients(prev => ({ ...prev, [u.id]: e.target.checked }))} />
                    <div className="flex-1">
                      <div className="text-sm">{`${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email}</div>
                      <div className="text-xs text-meta-muted">{u.email}</div>
                    </div>
                  </label>
                ))}
              </div>
            ) : composerMode === 'announcement' ? (
              <div className="space-y-2">
                <Input placeholder="Subject" value={composerSubject} onChange={(e) => setComposerSubject(e.target.value)} />
                <div className="text-xs text-meta-muted">Announcement will be sent to all coaches.</div>
              </div>
            ) : null}
            {(composerMode === 'dm' || composerMode === 'group') && composerFromChannel && (
              <Input placeholder="Subject (optional)" value={composerSubject} onChange={(e) => setComposerSubject(e.target.value)} />
            )}
            {/* Attachments */}
            <div className="flex flex-wrap gap-2 text-xs">
              <input ref={composerFileInputRef} type="file" multiple hidden onChange={(e) => handleComposerFilesSelected(e.target.files)} />
              <Button variant="secondary" size="sm" onClick={() => composerFileInputRef.current?.click()}>Attach</Button>
            </div>
            <div className="rounded-md border border-meta-border bg-meta-dark p-1">
              <MarkdownEditor value={composerBody} onChange={setComposerBody} preview={composerPreview} height={260} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setComposerOpen(false)}>Cancel</Button>
              <Button onClick={async () => {
                setLoading(true)
                try {
                  if (composerMode === 'dm') {
                    if (!composerTarget) return
                    const r = await fetch('/api/messaging/conversations/dm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: composerTarget, title: composerFromChannel ? composerSubject || null : null }) })
                    if (r.ok) {
                      const { conversationId } = await r.json()
                      await fetch(`/api/messaging/conversations/${conversationId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: composerBody }) })
                      setComposerOpen(false)
                      setComposerBody('')
                      setComposerSubject('')
                      setComposerFromChannel(false)
                      await fetchConversations()
                      setSelectedConversationId(conversationId)
                      const list = await fetchThreads(conversationId)
                      if (list[0]) { setSelectedThreadRoot(list[0].root_id); await fetchThreadMessages(list[0].root_id) }
                    }
                  } else if (composerMode === 'group') {
                    const ids = Object.entries(composeRecipients).filter(([, v]) => v).map(([id]) => id)
                    if (ids.length === 0) return
                    const r = await fetch('/api/messaging/conversations/group', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userIds: ids, title: composerFromChannel ? (composerSubject || undefined) : undefined }) })
                    if (r.ok) {
                      const { conversationId } = await r.json()
                      await fetch(`/api/messaging/conversations/${conversationId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: composerBody }) })
                      setComposerOpen(false)
                      setComposerBody('')
                      setComposerSubject('')
                      setComposerFromChannel(false)
                      await fetchConversations()
                      setSelectedConversationId(conversationId)
                      const list = await fetchThreads(conversationId)
                      if (list[0]) { setSelectedThreadRoot(list[0].root_id); await fetchThreadMessages(list[0].root_id) }
                    }
                  } else if (composerMode === 'announcement') {
                    // Announcement
                    if (!composerSubject.trim()) return
                    const r = await fetch('/api/messaging/announcements/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: composerSubject, body: composerBody }) })
                    if (r.ok) {
                      const { conversationId } = await r.json()
                      setComposerOpen(false)
                      setComposerBody('')
                      setComposerSubject('')
                      setComposerFromChannel(false)
                      await fetchConversations()
                      setSelectedConversationId(conversationId)
                      const list = await fetchThreads(conversationId)
                      if (list[0]) { setSelectedThreadRoot(list[0].root_id); await fetchThreadMessages(list[0].root_id) }
                    }
                  } else if (composerMode === 'reply') {
                    if (!selectedConversationId) return
                    const payload = privateReply
                      ? { body: composerBody, privateTo: privateRecipient, parentMessageId: selectedThreadRoot }
                      : { body: composerBody, parentMessageId: selectedThreadRoot }
                    const r = await fetch(`/api/messaging/conversations/${selectedConversationId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
                    if (r.ok) {
                      setComposerOpen(false)
                      setComposerBody('')
                      setComposerFromChannel(false)
                      setPrivateReply(false)
                      setPrivateRecipient('')
                      if (selectedThreadRoot) await fetchThreadMessages(selectedThreadRoot)
                    }
                  }
                } finally { setLoading(false) }
              }} disabled={loading || composerBody.trim().length === 0 || (composerMode === 'dm' && !composerTarget) || (composerMode === 'group' && Object.values(composeRecipients).every(v => !v)) || (composerMode === 'announcement' && !composerSubject.trim())}>Send</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
