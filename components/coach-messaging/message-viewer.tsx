"use client"

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'

export type MessageViewerProps = {
  senderName: string
  createdAt: string
  body: string
  highlightQuery?: string
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escapedQuery})`, 'gi')
  const parts = text.split(regex)
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-yellow-400/40 text-inherit rounded-sm px-0.5">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

export function MessageViewer({ senderName, createdAt, body, highlightQuery }: MessageViewerProps) {
  // When highlighting is active, render as plain text with highlights
  // rather than markdown (since highlighting within markdown elements is complex)
  const showHighlighted = !!highlightQuery?.trim()

  return (
    <div className="space-y-3 text-sm">
      <div className="text-xs text-meta-muted">
        <span className="font-medium text-meta-light">
          {showHighlighted ? <HighlightedText text={senderName} query={highlightQuery!} /> : senderName}
        </span>
        <span className="mx-1">&bull;</span>
        {createdAt}
      </div>
      <div className="prose prose-invert markdown-body max-w-none text-sm">
        {showHighlighted ? (
          <div className="whitespace-pre-wrap">
            <HighlightedText text={body} query={highlightQuery!} />
          </div>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{body}</ReactMarkdown>
        )}
      </div>
    </div>
  )
}
