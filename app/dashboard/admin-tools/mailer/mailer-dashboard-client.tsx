"use client"

import { useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CampaignStatusTable, type CampaignRow } from '@/components/dashboard/admin/campaign-status-table'
import { MailerComposer } from '@/components/dashboard/admin/mailer-composer'
import { toast } from 'sonner'

type CoachOption = { id: string; full_name: string | null; email: string | null }
type DraftOption = { id: string; subject: string; body_markdown: string; created_at: string }

interface MailerDashboardClientProps {
  coaches: CoachOption[]
  drafts: DraftOption[]
  campaigns: CampaignRow[]
}

export function MailerDashboardClient({ coaches, drafts, campaigns }: MailerDashboardClientProps) {
  const [templateToLoad, setTemplateToLoad] = useState<{ subject: string; bodyMarkdown: string } | null>(null)

  const handleUseAsTemplate = useCallback((subject: string, bodyMarkdown: string) => {
    setTemplateToLoad({ subject, bodyMarkdown })
    toast.success('Campaign loaded into editor')
    // Scroll to top so user sees the composer
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handleTemplateLoaded = useCallback(() => {
    setTemplateToLoad(null)
  }, [])

  return (
    <>
      <Card className="bg-meta-card border-meta-border">
        <CardHeader>
          <CardTitle className="text-meta-light">Compose Competitor Announcement</CardTitle>
          <CardDescription className="text-meta-muted">
            Create and send an email to all competitors on the game platform.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MailerComposer
            coaches={coaches}
            drafts={drafts}
            templateToLoad={templateToLoad}
            onTemplateLoaded={handleTemplateLoaded}
          />
        </CardContent>
      </Card>

      <Card className="bg-meta-card border-meta-border">
        <CardHeader>
          <CardTitle className="text-meta-light">Campaign History</CardTitle>
          <CardDescription className="text-meta-muted">
            Email campaigns sent to game-platform competitors. Delivery stats update via SendGrid webhooks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CampaignStatusTable campaigns={campaigns} onUseAsTemplate={handleUseAsTemplate} />
        </CardContent>
      </Card>
    </>
  )
}
