"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Edit, UserCheck, Gamepad2, Ban, Link as LinkIcon, ChevronDown, ChevronUp, ChevronsUpDown, Mail, Send } from "lucide-react"
import { sendEmail, emailTemplates } from "@/components/ui/email-composer"

export interface Competitor {
  id: string;
  first_name: string;
  last_name: string;
  email_personal?: string;
  email_school?: string;
  parent_email?: string;
  is_18_or_over?: boolean;
  grade?: string;
  status: string;
  media_release_signed: boolean;
  media_release_date?: string;
  participation_agreement_signed: boolean;
  participation_agreement_date?: string;
  game_platform_id?: string;
  game_platform_synced_at?: string;
  team_id?: string;
  team_name?: string;
  team_position?: number;
  profile_update_token?: string;
  profile_update_token_expires?: string;
  created_at: string;
  is_active: boolean;
  agreement_status?: string | null;
  agreement_mode?: string | null;
}

export const getStatusColor = (status: string) => {
  switch (status) {
    case 'complete':
      return 'bg-green-100 text-green-800';
    case 'compliance':
      return 'bg-purple-100 text-purple-800';
    case 'profile':
      return 'bg-blue-100 text-blue-800';
    case 'pending':
      return 'bg-yellow-100 text-yellow-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export const createCompetitorColumns = (
  onEdit: (id: string) => void,
  onRegenerateLink: (id: string) => Promise<string | null>,
  onRegister: (id: string) => void,
  onDisable: (id: string) => void,
  onTeamChange: (competitorId: string, teamId: string | undefined) => void,
  teams: Array<{id: string, name: string, memberCount?: number}>,
  openDropdown: string | null,
  setOpenDropdown: (id: string | null) => void,
  coachEmail?: string,
  coachName?: string,
  disableEdits?: boolean,
  disableTooltip?: string
): ColumnDef<Competitor>[] => [
  {
    accessorKey: "first_name",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="h-auto p-0 font-medium text-left hover:bg-transparent"
      >
        Name
        {column.getIsSorted() === "asc" ? (
          <ChevronUp className="ml-2 h-4 w-4" />
        ) : column.getIsSorted() === "desc" ? (
          <ChevronDown className="ml-2 h-4 w-4" />
        ) : (
          <ChevronsUpDown className="ml-2 h-4 w-4" />
        )}
      </Button>
    ),
    cell: ({ row }) => {
      const competitor = row.original;
      return (
        <div>
          <div className="font-medium text-meta-light">
            {competitor.first_name} {competitor.last_name}
          </div>
          {competitor.grade && (
            <div className="text-sm text-meta-muted">
              Grade: {competitor.grade}
            </div>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="h-auto p-0 font-medium text-left hover:bg-transparent"
      >
        Status
        {column.getIsSorted() === "asc" ? (
          <ChevronUp className="ml-2 h-4 w-4" />
        ) : column.getIsSorted() === "desc" ? (
          <ChevronDown className="ml-2 h-4 w-4" />
        ) : (
          <ChevronsUpDown className="ml-2 h-4 w-4" />
        )}
      </Button>
    ),
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      return (
        <div className="text-center">
          <Badge className={getStatusColor(status)}>
            {status}
          </Badge>
        </div>
      );
    },
  },
  {
    accessorKey: "compliance",
    header: "Compliance",
    cell: ({ row }) => {
      const competitor = row.original;
      return (
        <div className="text-center">
          {competitor.is_18_or_over ? (
            // 18+ only needs participation agreement
            <div className={`px-2 py-1 text-xs font-medium rounded ${competitor.participation_agreement_date ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
              Agreement
            </div>
          ) : (
            // Under 18 needs media release
            <div className={`px-2 py-1 text-xs font-medium rounded ${competitor.media_release_date ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
              Release
            </div>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "game_platform_synced_at",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="h-auto p-0 font-medium text-left hover:bg-transparent"
      >
        Game Platform
        {column.getIsSorted() === "asc" ? (
          <ChevronUp className="ml-2 h-4 w-4" />
        ) : column.getIsSorted() === "desc" ? (
          <ChevronDown className="ml-2 h-4 w-4" />
        ) : (
          <ChevronsUpDown className="ml-2 h-4 w-4" />
        )}
      </Button>
    ),
    cell: ({ row }) => {
      const competitor = row.original;
      return (
        <div className="text-center">
          <div className={`px-2 py-1 text-xs font-medium rounded ${competitor.game_platform_synced_at ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
            {competitor.game_platform_synced_at ? 'Registered' : 'Waiting'}
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "team_name",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="h-auto p-0 font-medium text-left hover:bg-transparent"
      >
        Team
        {column.getIsSorted() === "asc" ? (
          <ChevronUp className="ml-2 h-4 w-4" />
        ) : column.getIsSorted() === "desc" ? (
          <ChevronDown className="ml-2 h-4 w-4" />
        ) : (
          <ChevronsUpDown className="ml-2 h-4 w-4" />
        )}
      </Button>
    ),
    cell: ({ row }) => {
      const competitor = row.original;
      const isDisabled = !competitor.is_active;
      const globalDisabled = !!disableEdits;
      const title = globalDisabled ? (disableTooltip || 'Select a coach to edit') : undefined;
      
      return (
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => !(isDisabled || globalDisabled) && setOpenDropdown(openDropdown === competitor.id ? null : competitor.id)}
            className={`${(isDisabled || globalDisabled) ? 'bg-meta-muted text-meta-muted cursor-not-allowed' : 'bg-meta-accent text-white hover:bg-blue-600'}`}
            disabled={isDisabled || globalDisabled}
            title={title}
          >
            <span>{competitor.team_name || 'No Team'}</span>
            <ChevronDown className="ml-2 h-3 w-3" />
          </Button>
          
          {openDropdown === competitor.id && !(isDisabled || globalDisabled) && (
            <div className="absolute top-full left-0 mt-1 bg-meta-card border border-meta-border rounded-lg shadow-lg z-10 min-w-32">
              <div className="py-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onTeamChange(competitor.id, undefined)}
                  className="w-full justify-start"
                >
                  No Team
                </Button>
                {teams
                  .filter(team => (team.memberCount || 0) < 6)
                  .map((team) => (
                    <Button
                      key={team.id}
                      variant="ghost"
                      size="sm"
                      onClick={() => onTeamChange(competitor.id, team.id)}
                      className="w-full justify-start"
                    >
                      {team.name} ({6 - (team.memberCount || 0)} seats)
                    </Button>
                  ))}
              </div>
            </div>
          )}
        </div>
      );
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      const competitor = row.original;
      const isDisabled = !competitor.is_active;
      const globalDisabled = !!disableEdits;
      const mergedDisabled = isDisabled || globalDisabled;
      const title = globalDisabled ? (disableTooltip || 'Select a coach to edit') : 'Edit Competitor';
      const statusOk = ['profile','compliance','complete'].includes((competitor.status || '').toLowerCase())
      const emailRegex = /.+@.+\..+/;
      const adultRecipient = (competitor.email_personal && emailRegex.test(competitor.email_personal)) || (competitor.email_school && emailRegex.test(competitor.email_school))
      const minorRecipient = competitor.parent_email && emailRegex.test(competitor.parent_email)
      const hasLegacySigned = competitor.is_18_or_over ? !!competitor.participation_agreement_date : !!competitor.media_release_date
      const hasAgreement = !!competitor.agreement_status // any agreement row exists
      const canSend = !mergedDisabled && competitor.is_active && statusOk && !hasLegacySigned && !hasAgreement && (
        competitor.is_18_or_over ? adultRecipient : minorRecipient
      )
      
      const handleSend = async () => {
        try {
          const res = await fetch('/api/zoho/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ competitorId: competitor.id, mode: 'email' })
          })
          if (!res.ok) {
            let msg = 'Failed to send release'
            try { const j = await res.json(); if (j?.error) msg = j.error } catch {}
            throw new Error(msg)
          }
          alert('Release sent for digital signature.')
        } catch (e: any) {
          alert(e?.message || 'Failed to send release')
        }
      }

      return (
        <div className="flex items-center justify-end space-x-1 w-full">
          {canSend && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSend}
              title={globalDisabled ? (disableTooltip || 'Select a coach to edit') : 'Send for digital signature'}
              className={`p-1 ${mergedDisabled ? 'text-meta-muted cursor-not-allowed' : 'text-meta-light hover:text-meta-accent'}`}
              disabled={mergedDisabled}
              aria-disabled={mergedDisabled}
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(competitor.id)}
            title={title}
            className={`p-1 ${mergedDisabled ? 'text-meta-muted cursor-not-allowed' : 'text-meta-light hover:text-meta-accent'}`}
            disabled={mergedDisabled}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              const newProfileUrl = await onRegenerateLink(competitor.id);
              if (newProfileUrl && coachEmail && coachName) {
                const competitorEmail = competitor.email_school || competitor.email_personal;
                if (competitorEmail) {
                  const template = emailTemplates.profileUpdate(
                    competitor.first_name,
                    newProfileUrl,
                    coachName
                  );
                  sendEmail(competitorEmail, coachEmail, template);
                }
              }
            }}
            title={globalDisabled ? (disableTooltip || 'Select a coach to edit') : 'Regenerate Profile Link & Send Email'}
            className={`p-1 ${mergedDisabled ? 'text-meta-muted cursor-not-allowed' : 'text-meta-light hover:text-meta-accent'}`}
            disabled={mergedDisabled}
            aria-disabled={mergedDisabled}
          >
            <LinkIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRegister(competitor.id)}
            title={globalDisabled ? (disableTooltip || 'Select a coach to edit') : 'Register on Game Platform'}
            className={`p-1 ${mergedDisabled ? 'text-meta-muted cursor-not-allowed' : 'text-meta-light hover:text-meta-accent'}`}
            disabled={mergedDisabled}
            aria-disabled={mergedDisabled}
          >
            <Gamepad2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDisable(competitor.id)}
            title={globalDisabled ? (disableTooltip || 'Select a coach to edit') : (competitor.is_active ? 'Disable Competitor' : 'Enable Competitor')}
            className={`p-1 ${globalDisabled ? 'text-meta-muted cursor-not-allowed' : (competitor.is_active ? 'text-meta-light hover:text-meta-accent' : 'text-red-500 hover:text-red-600')}`}
            disabled={globalDisabled}
            aria-disabled={globalDisabled}
          >
            {competitor.is_active ? <Ban className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
          </Button>
        </div>
      );
    },
  },
];
