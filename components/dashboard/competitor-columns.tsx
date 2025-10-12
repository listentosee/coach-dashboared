"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Edit, UserCheck, Gamepad2, Ban, Link as LinkIcon, ChevronDown, ChevronUp, ChevronsUpDown, Send, FileText, Trophy } from "lucide-react"
import { emailTemplates } from "@/components/ui/email-composer"

const DIVISION_LABELS: Record<string, string> = {
  middle_school: 'Middle School',
  high_school: 'High School',
  college: 'College',
};

const formatDivisionLabel = (division?: string | null) => {
  if (!division) return null;
  return DIVISION_LABELS[division] ?? division.replace(/_/g, ' ');
};

export interface Competitor {
  id: string;
  first_name: string;
  last_name: string;
  email_personal?: string;
  email_school?: string;
  parent_email?: string;
  is_18_or_over?: boolean;
  grade?: string;
  division?: string | null;
  status: string;
  media_release_signed: boolean;
  media_release_date?: string;
  participation_agreement_signed: boolean;
  participation_agreement_date?: string;
  game_platform_id?: string;
  game_platform_synced_at?: string;
  game_platform_sync_error?: string | null;
  game_platform_status?: string | null;
  team_id?: string;
  team_name?: string;
  team_position?: number;
  profile_update_token?: string;
  profile_update_token_expires?: string;
  created_at: string;
  is_active: boolean;
  agreement_status?: string | null;
  agreement_mode?: string | null;
  coach_name?: string | null;
  coach_email?: string | null;
  coach_id?: string | null;
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
  registeringId: string | null,
  onDisable: (id: string) => void,
  onTeamChange: (competitorId: string, teamId: string | undefined) => void,
  teams: Array<{id: string, name: string, memberCount?: number}>,
  openDropdown: string | null,
  setOpenDropdown: (id: string | null) => void,
  onProfileLinkPrepared: (payload: {
    competitor: Competitor
    profileUrl: string
    recipients: string[]
    template: { subject: string; body: string }
    coachEmail?: string | null
    coachName?: string | null
  }) => void,
  coachEmail?: string | null,
  coachName?: string | null,
  coachDirectory?: Record<string, { name?: string | null; email?: string | null }>,
  showCoachContextHint?: boolean,
  disableEdits?: boolean,
  disableTooltip?: string,
  onViewReportCard?: (id: string) => void
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
      const directoryEntry = competitor.coach_id ? coachDirectory?.[competitor.coach_id] : undefined
      const idFallback = competitor.coach_id ? `${competitor.coach_id.slice(0, 8)}…` : 'Unknown coach';
      const coachLabel = directoryEntry?.name || competitor.coach_name || directoryEntry?.email || competitor.coach_email || idFallback;
      const showCoachHint = !!showCoachContextHint && coachLabel;
      return (
        <div title={showCoachHint ? `Coach: ${coachLabel}` : undefined}>
          <div className="font-medium text-meta-light">
            {competitor.first_name} {competitor.last_name}
          </div>
          {(() => {
            const divisionLabel = formatDivisionLabel(competitor.division);
            const gradeLabel = competitor.grade ? `G ${competitor.grade}` : null;
            const badge = [divisionLabel, gradeLabel].filter(Boolean).join(' • ');
            return badge ? (
              <div className="text-sm text-meta-muted">
                {badge}
              </div>
            ) : null;
          })()}
          {showCoachHint && (
            <div className="text-xs text-meta-muted mt-1">
              Coach: {coachLabel}
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
      const displayLabel = status === 'complete' ? 'In The Game' : status;
      return (
        <div className="text-center">
          <Badge className={getStatusColor(status)}>
            {displayLabel}
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
      const isRegistered = Boolean(competitor.game_platform_synced_at);
      return (
        <div className="text-center">
          <div className={`px-2 py-1 text-xs font-medium rounded ${isRegistered ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
            {isRegistered ? 'Registered' : 'Waiting'}
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
      const isRegistering = registeringId === competitor.id;
      const canRegister = competitor.status === 'compliance' && !competitor.game_platform_id && competitor.is_active && !mergedDisabled;
      const registerDisabled = mergedDisabled || !canRegister || isRegistering;
      const registerTooltip = globalDisabled
        ? (disableTooltip || 'Select a coach to edit')
        : !competitor.is_active
          ? 'Competitor is inactive'
          : competitor.game_platform_id
            ? 'Already on the Game Platform'
            : competitor.status !== 'compliance'
              ? 'Complete compliance steps before registering'
              : undefined;
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
          {competitor.game_platform_synced_at && onViewReportCard && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onViewReportCard(competitor.id)}
              title="View Report Card"
              className="p-1 text-meta-light hover:text-meta-accent"
            >
              <FileText className="h-4 w-4" />
            </Button>
          )}
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
              if (newProfileUrl) {
                const emailRegex = /.+@.+\..+/;
                // Always use competitor's own email (school or personal), never parent
                const recipients = [competitor.email_school, competitor.email_personal].filter((value): value is string => !!value && emailRegex.test(value))

                if (!recipients.length) {
                  alert(`No valid email found for ${competitor.first_name} ${competitor.last_name}. Please add a school or personal email before sharing the profile link.`);
                  return;
                }

                const template = emailTemplates.profileUpdate(
                  competitor.first_name,
                  newProfileUrl,
                  coachName || 'Coach'
                );

                onProfileLinkPrepared({
                  competitor,
                  profileUrl: newProfileUrl,
                  recipients,
                  template,
                  coachEmail,
                  coachName,
                });
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
            onClick={() => !registerDisabled && onRegister(competitor.id)}
            title={registerTooltip ?? 'Register on Game Platform'}
            className={`p-1 ${registerDisabled ? 'text-meta-muted cursor-not-allowed' : 'text-meta-light hover:text-meta-accent'} ${isRegistering ? 'animate-pulse' : ''}`}
            disabled={registerDisabled}
            aria-disabled={registerDisabled}
          >
            {competitor.status === 'complete' && competitor.game_platform_id ? (
              <Trophy className="h-4 w-4" />
            ) : (
              <Gamepad2 className="h-4 w-4" />
            )}
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
