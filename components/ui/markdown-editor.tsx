"use client"

import dynamic from 'next/dynamic'
import { useMemo } from 'react'
import '@uiw/react-md-editor/markdown-editor.css'
import '@uiw/react-markdown-preview/markdown.css'

const MDEditor = dynamic(() => import('@uiw/react-md-editor'), { ssr: false }) as any

type Props = {
  value: string
  onChange: (next: string) => void
  preview?: boolean
  height?: number | string
}

export default function MarkdownEditor({ value, onChange, preview, height }: Props) {
  const mode = useMemo(() => (preview ? 'live' : 'edit'), [preview])
  return (
    <div data-color-mode="dark">
      <MDEditor value={value} onChange={(v: string) => onChange(v || '')} preview={mode} height={typeof height === 'number' ? height : undefined} style={typeof height === 'string' ? { height } : undefined} />
    </div>
  )
}

