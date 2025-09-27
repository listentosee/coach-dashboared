"use client"

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'

export type MessageViewerProps = {
  senderName: string
  createdAt: string
  body: string
}

export function MessageViewer({ senderName, createdAt, body }: MessageViewerProps) {
  return (
    <div className="space-y-3 text-sm">
      <div className="text-xs text-meta-muted">
        <span className="font-medium text-meta-light">{senderName}</span>
        <span className="mx-1">•</span>
        {createdAt}
      </div>
      <div className="prose prose-invert markdown-body max-w-none text-sm">
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{body}</ReactMarkdown>
      </div>
    </div>
  )
}
