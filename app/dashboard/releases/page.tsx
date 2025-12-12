'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ActingAsBanner from '@/components/admin/ActingAsBanner'
import { supabase } from '@/lib/supabase/client';
import { useAdminCoachContext } from '@/lib/admin/useAdminCoachContext';
import { useSearch } from '@/lib/contexts/SearchContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { DataTable } from '@/components/ui/data-table';
import { ColumnDef } from '@tanstack/react-table';

import { 
  Send, 
  FileText, 
  CheckCircle, 
  Clock, 
  XCircle, 
  AlertCircle,
  Download,
  RefreshCw,
  Upload,
  Ban,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown
} from 'lucide-react';

interface Competitor {
  id: string;
  first_name: string;
  last_name: string;
  grade: string;
  division?: string | null;
  school: string;
  is_18_or_over: boolean;
  email_school: string;
  parent_name: string;
  parent_email: string;
  participation_agreement_date: string | null;
  media_release_date: string | null;
  status: string;
  is_active: boolean;
}

interface Agreement {
  id: string;
  competitor_id: string;
  template_kind: 'adult' | 'minor';
  status: 'sent' | 'viewed' | 'completed' | 'declined' | 'expired' | 'completed_manual' | 'print_ready';
  request_id: string;
  signed_pdf_path: string | null;
  created_at: string;
  updated_at: string;
  completion_source?: 'email' | 'print' | 'manual';
  metadata?: {
    mode: 'email' | 'print';
  };
}

interface ReleaseData {
  competitor: Competitor;
  agreement?: Agreement;
  hasLegacySigned: boolean;
}

export default function ReleaseManagementPage() {
  const { coachId, loading: ctxLoading } = useAdminCoachContext()
  const { searchTerm } = useSearch()
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedAgreement, setSelectedAgreement] = useState<Agreement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [canceling, setCanceling] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [visibleCount, setVisibleCount] = useState(40)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const [analytics, setAnalytics] = useState<{ competitorCount?: number; teamCount?: number; statusCounts?: any } | null>(null)
  const [releaseOffset, setReleaseOffset] = useState(0)
  const [releaseTotal, setReleaseTotal] = useState<number | null>(null)
  const [releaseStatusSummary, setReleaseStatusSummary] = useState<{
    total: number
    notSent: number
    sent: number
    signedDigitally: number
    signedManually: number
    signedLegacy: number
    signedTotal: number
  } | null>(null)
  const releaseInitLoadingRef = useRef(false)
  const releaseLoadingRef = useRef(false)

  const computeReleaseSummary = useCallback(
    (competitorsList: Competitor[], agreementsList: Agreement[]) => {
      const summary = {
        total: competitorsList.length,
        notSent: 0,
        sent: 0,
        signedDigitally: 0,
        signedManually: 0,
        signedLegacy: 0,
        signedTotal: 0,
      }

      const agreementMap = new Map<string, Agreement>()
      for (const agreement of agreementsList) {
        if (!agreementMap.has(agreement.competitor_id)) {
          agreementMap.set(agreement.competitor_id, agreement)
        }
      }

      for (const competitor of competitorsList) {
        const agreement = agreementMap.get(competitor.id)
        const hasLegacy = competitor.is_18_or_over
          ? !!competitor.participation_agreement_date
          : !!competitor.media_release_date

        if (agreement?.status === 'completed') {
          if (agreement.completion_source === 'manual') {
            summary.signedManually += 1
            summary.signedTotal += 1
          } else {
            summary.signedDigitally += 1
            summary.signedTotal += 1
          }
        } else if (agreement?.status === 'completed_manual') {
          summary.signedManually += 1
          summary.signedTotal += 1
        } else if (hasLegacy) {
          summary.signedLegacy += 1
          summary.signedTotal += 1
        } else if (agreement) {
          summary.sent += 1
        } else {
          summary.notSent += 1
        }
      }

      return summary
    },
    [],
  )

  const fetchData = useCallback(
    async (opts?: { reset?: boolean }) => {
      const reset = opts?.reset ?? false
      setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        console.error('No session found')
        return
      }

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        const adminMode = (profile as any)?.role === 'admin'
        setIsAdmin(adminMode)

        let scopedCompetitors: Competitor[] = []
        let scopedAgreements: Agreement[] = []
        let summary: {
          total: number
          notSent: number
          sent: number
          signedDigitally: number
          signedManually: number
          signedLegacy: number
          signedTotal: number
        } | null = null

        if (adminMode && !coachId) {
          if (reset) {
            releaseInitLoadingRef.current = false
            releaseLoadingRef.current = false
            setReleaseOffset(0)
            setReleaseTotal(null)
            setReleaseStatusSummary(null)
            setCompetitors([])
            setAgreements([])
          }

        if (releaseInitLoadingRef.current && !reset) {
          setLoading(false)
          return
        }

          releaseInitLoadingRef.current = true
          releaseLoadingRef.current = true

          try {
            const limit = 40
            const response = await fetch(`/api/releases/paged?offset=0&limit=${limit}`)
            if (!response.ok) throw new Error('Failed to load releases')

            const payload = await response.json()
            const rows = (payload.competitors || []) as Competitor[]
            const agreementsRows = (payload.agreements || []) as Agreement[]

            scopedCompetitors = rows
            scopedAgreements = agreementsRows
            summary = payload.summary ?? computeReleaseSummary(rows, agreementsRows)

            setCompetitors(scopedCompetitors)
            setAgreements(scopedAgreements)
            setReleaseOffset(scopedCompetitors.length)
            setReleaseTotal(payload.total ?? scopedCompetitors.length)
            setReleaseStatusSummary(summary)
          } catch (error) {
            console.error('Initial release load failed', error)
            scopedCompetitors = []
            scopedAgreements = []
            summary = { total: 0, notSent: 0, sent: 0, signedDigitally: 0, signedManually: 0, signedLegacy: 0, signedTotal: 0 }
            setCompetitors(scopedCompetitors)
            setAgreements(scopedAgreements)
            setReleaseOffset(0)
            setReleaseTotal(0)
            setReleaseStatusSummary(summary)
          } finally {
            releaseLoadingRef.current = false
          }
        } else {
          const scopeCoachId = adminMode && coachId ? coachId : user.id

          const { data: competitorsData } = await supabase
            .from('release_eligible_competitors')
            .select('*')
            .eq('coach_id', scopeCoachId)
            .order('first_name', { ascending: true })
            .order('last_name', { ascending: true })

          scopedCompetitors = competitorsData || []
          setCompetitors(scopedCompetitors)
          setReleaseOffset(scopedCompetitors.length)
          setReleaseTotal(scopedCompetitors.length)

          const { data: agreementsData } = await supabase
            .from('agreements')
            .select('*')
            .in('competitor_id', scopedCompetitors.map((c: any) => c.id))
            .order('created_at', { ascending: false })

          scopedAgreements = agreementsData || []
          setAgreements(scopedAgreements)
          summary = computeReleaseSummary(scopedCompetitors, scopedAgreements)
          setReleaseStatusSummary(summary)
        }

        if (adminMode) {
          const analyticsUrl = coachId
            ? `/api/admin/analytics?coach_id=${coachId}`
            : '/api/admin/analytics'
          try {
            const ar = await fetch(analyticsUrl)
            if (ar.ok) {
              const aj = await ar.json()
              setAnalytics({
                competitorCount: aj?.totals?.competitorCount,
                teamCount: aj?.totals?.teamCount,
                statusCounts: aj?.statusCounts,
              })
            } else {
              setAnalytics(null)
            }
          } catch {
            setAnalytics(null)
          }
        } else {
          setAnalytics({ competitorCount: scopedCompetitors.length, teamCount: 0, statusCounts: null })
        }
      } catch (error) {
        console.error('Error fetching release data:', error)
      } finally {
        setLoading(false)
      }
    },
    [coachId, computeReleaseSummary],
  )

  // Initial and context-based fetch
  useEffect(() => {
    if (!ctxLoading) fetchData({ reset: true })
  }, [ctxLoading, coachId, fetchData])

  const fetchMoreReleases = useCallback(async () => {
    if (!(isAdmin && !coachId)) return
    if (releaseLoadingRef.current) return
    if (releaseTotal !== null && releaseOffset >= releaseTotal) return

    releaseLoadingRef.current = true
    try {
      const limit = 20
      const response = await fetch(`/api/releases/paged?offset=${releaseOffset}&limit=${limit}`)
      if (!response.ok) {
        throw new Error('Failed to load additional releases')
      }

      const payload = await response.json()
      const rows = (payload.competitors || []) as Competitor[]
      if (rows.length) {
        const nextCompetitors = [...competitors, ...rows]

        const incomingAgreements = (payload.agreements || []) as Agreement[]
        const agreementMap = new Map<string, Agreement>()
        for (const item of agreements) agreementMap.set(item.id, item)
        for (const item of incomingAgreements) agreementMap.set(item.id, item)
        const nextAgreements = Array.from(agreementMap.values()).sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )

        setCompetitors(nextCompetitors)
        setAgreements(nextAgreements)
        setReleaseOffset(nextCompetitors.length)
        setReleaseTotal(payload.total ?? releaseTotal ?? nextCompetitors.length)
        if (payload.summary) {
          setReleaseStatusSummary(payload.summary)
        }
      } else {
        if (payload.total !== undefined && payload.total !== null) {
          setReleaseTotal(payload.total)
          setReleaseOffset(payload.total)
        }
        if (payload.summary) {
          setReleaseStatusSummary(payload.summary)
        }
      }
    } catch (error) {
      console.error('Error loading additional releases', error)
    } finally {
      releaseLoadingRef.current = false
    }
  }, [agreements, coachId, competitors, isAdmin, releaseOffset, releaseTotal])

  const sendRelease = async (competitorId: string, mode: 'email' | 'print' = 'email') => {
    try {
      setSending(competitorId);
      
      // Validate recipient email before initiating Zoho per feedback
      const comp = competitors.find(c => c.id === competitorId)
      if (!comp) throw new Error('Competitor not found')
      const emailRegex = /.+@.+\..+/
      if (comp.is_18_or_over) {
        if (!emailRegex.test((comp.email_school || '').trim())) {
          throw new Error('Adult competitor requires a valid school email before sending.')
        }
      } else {
        if (!emailRegex.test((comp.parent_email || '').trim())) {
          throw new Error('Parent email is required and must be valid before sending.')
        }
      }

      const response = await fetch('/api/zoho/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competitorId, mode }),
      });

      if (!response.ok) {
        let msg = 'Failed to send release'
        try { const j = await response.json(); if (j?.error) msg = j.error } catch {}
        throw new Error(msg);
      }

      // Refresh data to show new agreement
      await fetchData({ reset: true });
    } catch (error: any) {
      console.error('Error sending release:', error);
      alert(error?.message || 'Failed to send release. Please try again.');
    } finally {
      setSending(null);
    }
  };

  const openUploadModal = (agreement: Agreement) => {
    setSelectedAgreement(agreement);
    setUploadModalOpen(true);
  };

  const handleFileUpload = async (file: File) => {
    if (!selectedAgreement) return;
    
    try {
      setUploading(true);
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('agreementId', selectedAgreement.id);
      
      const response = await fetch('/api/zoho/upload-manual', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let message = 'Failed to upload file';
        try {
          const payload = await response.json();
          if (payload?.error) {
            message = payload.error;
            if (payload?.details) {
              message = `${message}: ${payload.details}`;
            }
          } else if (payload?.message) {
            message = payload.message;
          }
        } catch (parseError) {
          console.warn('Failed to parse upload error payload', parseError);
        }
        throw new Error(message);
      }

      // Refresh data and close modal
      await fetchData({ reset: true });
      setUploadModalOpen(false);
      setSelectedAgreement(null);
    } catch (error) {
      console.error('Error uploading file:', error);
      const message = error instanceof Error ? error.message : 'Failed to upload file. Please try again.';
      alert(message);
    } finally {
      setUploading(false);
    }
  };

  const cancelAgreement = useCallback(
    async (agreement: Agreement, competitor: Competitor) => {
      const displayName = `${competitor.first_name} ${competitor.last_name}`;
      const confirmMessage = `Cancel the Zoho request for ${displayName}? This stops the digital signing flow and removes it from the queue so you can use the manual override.`;

      if (typeof window !== 'undefined' && !window.confirm(confirmMessage)) {
        return;
      }

      try {
        setCanceling(agreement.id);

        const response = await fetch('/api/zoho/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agreementId: agreement.id }),
        });

        if (!response.ok) {
          let message = 'Failed to cancel agreement';
          try {
            const payload = await response.json();
            if (payload?.error) {
              message = payload.details ? `${payload.error}: ${payload.details}` : payload.error;
            }
          } catch {
            // ignore parse errors
          }
          throw new Error(message);
        }

        const payload = await response.json();
        const cleanup = payload?.zohoCleanup;

        if (cleanup && (cleanup.recallSuccess === false || cleanup.deleteSuccess === false)) {
          alert('Agreement cancelled locally, but Zoho cleanup is pending. Please retry later or follow up with support.');
        }

        await fetchData({ reset: true });
      } catch (error) {
        console.error('Error cancelling agreement:', error);
        const message = error instanceof Error ? error.message : 'Failed to cancel agreement. Please try again.';
        alert(message);
      } finally {
        setCanceling(null);
      }
    },
    [fetchData],
  );

  const downloadPDF = async (signedPdfPath: string, competitorName: string) => {
    try {
      // Use server-side download endpoint to avoid CORS issues
      const response = await fetch(`/api/zoho/download?path=${encodeURIComponent(signedPdfPath)}&name=${encodeURIComponent(competitorName)}-release.pdf`);
      
      if (!response.ok) {
        throw new Error('Failed to download PDF');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${competitorName}-release.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      alert('Failed to download PDF. Please try again.');
    }
  };

  const getReleaseStatusLabel = (agreement?: Agreement, hasLegacySigned?: boolean): string => {
    if (agreement) {
      switch (agreement.status) {
        case 'completed':
          return agreement.completion_source === 'manual' ? 'Signed Manually' : 'Signed Digitally';
        case 'completed_manual':
          return 'Signed Manually';
        case 'sent':
          return 'Sent';
        case 'print_ready':
          return 'Print Ready';
        case 'viewed':
          return 'Viewed';
        case 'declined':
          return 'Declined';
        case 'expired':
          return 'Expired';
        default:
          return 'Not Sent';
      }
    }

    if (hasLegacySigned) return 'Signed Legacy';
    return 'Not Sent';
  };

  const renderStatusBadge = (agreement?: Agreement, hasLegacySigned?: boolean) => {
    const label = getReleaseStatusLabel(agreement, hasLegacySigned);
    switch (label) {
      case 'Signed Digitally':
        return <Badge className="bg-emerald-600 text-white"><CheckCircle className="h-3 w-3 mr-1" />{label}</Badge>;
      case 'Signed Manually':
        return <Badge className="bg-orange-600 text-white"><CheckCircle className="h-3 w-3 mr-1" />{label}</Badge>;
      case 'Signed Legacy':
        return <Badge className="bg-teal-600 text-white"><CheckCircle className="h-3 w-3 mr-1" />{label}</Badge>;
      case 'Sent':
        return <Badge className="bg-blue-600 text-white"><Clock className="h-3 w-3 mr-1" />{label}</Badge>;
      case 'Print Ready':
        return <Badge className="bg-purple-600 text-white"><FileText className="h-3 w-3 mr-1" />{label}</Badge>;
      case 'Viewed':
        return <Badge className="bg-yellow-600 text-white"><FileText className="h-3 w-3 mr-1" />{label}</Badge>;
      case 'Declined':
        return <Badge className="bg-red-600 text-white"><XCircle className="h-3 w-3 mr-1" />{label}</Badge>;
      case 'Expired':
        return <Badge className="bg-gray-600 text-white"><AlertCircle className="h-3 w-3 mr-1" />{label}</Badge>;
      default:
        return <Badge className="bg-rose-600 text-white"><AlertCircle className="h-3 w-3 mr-1" />Not Sent</Badge>;
    }
  };

  // Get status priority for sorting (lower number = higher priority)
  const getStatusPriority = (status: string, hasLegacySigned: boolean) => {
    if (hasLegacySigned) return 0; // Legacy signed has highest priority
    if (!status) return 10; // No release has lowest priority
    
    const priorityMap: { [key: string]: number } = {
      'completed': 1,
      'completed_manual': 1,
      'print_ready': 2,
      'viewed': 3,
      'sent': 4,
      'expired': 5,
      'declined': 6
    };
    
    return priorityMap[status] || 10;
  };

  const eligibleCompetitors = useMemo(() => {
    const statusOrder = ['pending', 'profile', 'compliance', 'complete']
    const profileIndex = statusOrder.indexOf('profile')
    return competitors.filter(competitor => {
      if (!competitor.is_active) return false
      const competitorStatusIndex = statusOrder.indexOf(competitor.status)
      return competitorStatusIndex >= profileIndex
    })
  }, [competitors])

  const agreementMap = useMemo(() => {
    const map = new Map<string, Agreement>()
    for (const agreement of agreements) {
      if (!map.has(agreement.competitor_id)) {
        map.set(agreement.competitor_id, agreement)
      }
    }
    return map
  }, [agreements])

  const releaseUniverse: ReleaseData[] = useMemo(() => {
    return eligibleCompetitors.map(competitor => {
      const agreement = agreementMap.get(competitor.id)
      const hasLegacySigned = competitor.is_18_or_over
        ? !!competitor.participation_agreement_date
        : !!competitor.media_release_date
      return { competitor, agreement, hasLegacySigned }
    })
  }, [eligibleCompetitors, agreementMap])

  const releaseStatusCounts = useMemo(() => {
    if (releaseStatusSummary) {
      const {
        notSent,
        sent,
        signedDigitally,
        signedManually,
        signedLegacy,
        signedTotal,
      } = releaseStatusSummary

      return { notSent, sent, signedDigitally, signedManually, signedLegacy, signedTotal }
    }

    const counts = {
      notSent: 0,
      sent: 0,
      signedDigitally: 0,
      signedManually: 0,
      signedLegacy: 0,
      signedTotal: 0,
    }

    for (const item of releaseUniverse) {
      const agreement = item.agreement

      if (agreement && agreement.status === 'completed') {
        if (agreement.completion_source === 'manual') {
          counts.signedManually += 1
          counts.signedTotal += 1
        } else {
          counts.signedDigitally += 1
          counts.signedTotal += 1
        }
        continue
      }

      if (agreement && agreement.status === 'completed_manual') {
        counts.signedManually += 1
        counts.signedTotal += 1
        continue
      }

      if (item.hasLegacySigned) {
        counts.signedLegacy += 1
        counts.signedTotal += 1
        continue
      }

      if (agreement) {
        counts.sent += 1
        continue
      }

      counts.notSent += 1
    }

    return counts
  }, [releaseStatusSummary, releaseUniverse])

  const totalCompetitorsCount = analytics?.competitorCount ?? competitors.length
  const releaseEligibleTotal = releaseStatusSummary?.total ?? releaseTotal ?? releaseUniverse.length
  const releaseLoadedCount = releaseUniverse.length

  const searchTermNormalized = searchTerm.trim().toLowerCase()

  const releaseData: ReleaseData[] = useMemo(() => {
    const matchesSearch = (competitor: Competitor) => {
      if (!searchTermNormalized) return true
      const term = searchTermNormalized
      return (
        competitor.first_name.toLowerCase().includes(term) ||
        competitor.last_name.toLowerCase().includes(term) ||
        (competitor.school || '').toLowerCase().includes(term) ||
        (competitor.grade || '').toLowerCase().includes(term)
      )
    }

    const scoped = releaseUniverse.filter(row => matchesSearch(row.competitor))
    if (!hideCompleted) return scoped
    return scoped.filter(item => {
      const status = item.agreement?.status
      const isCompleted = status === 'completed' || status === 'completed_manual' || item.hasLegacySigned
      return !isCompleted
    })
  }, [releaseUniverse, searchTermNormalized, hideCompleted])

  const isAdminAll = isAdmin && !coachId
  const displayedCount = isAdminAll ? releaseData.length : Math.min(visibleCount, releaseData.length)
  const totalCount = isAdminAll ? releaseEligibleTotal : releaseData.length

  const getScrollParent = (el: HTMLElement | null): HTMLElement | null => {
    let node: HTMLElement | null = el?.parentElement ?? null
    while (node) {
      const style = window.getComputedStyle(node)
      const overflowY = style.overflowY
      if (overflowY === 'auto' || overflowY === 'scroll') return node
      node = node.parentElement
    }
    return null
  }

  const columns: ColumnDef<ReleaseData>[] = [
    {
      accessorKey: "competitor.first_name",
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
        const competitor = row.original.competitor;
        const divisionLabel = competitor.division
          ? competitor.division.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
          : 'No Division';
        const gradeLabel = competitor.grade ? `Grade ${competitor.grade}` : 'Grade N/A';
        return (
          <div>
            <div className="font-medium text-meta-light">
              {competitor.first_name} {competitor.last_name}
            </div>
            <div className="text-sm text-meta-muted">
              {divisionLabel} • {gradeLabel.replace('Grade ', 'G ')}
            </div>
            <div className="text-xs text-meta-muted">{competitor.school}</div>
            <div className="text-xs text-meta-muted">
              {competitor.is_18_or_over ? 'Adult' : 'Minor'} • 
              {competitor.is_18_or_over ? ` ${competitor.email_school}` : ` ${competitor.parent_email}`}
            </div>
          </div>
        );
      },
    },
    {
      id: "status",
      accessorFn: (row) => ({
        priority: getStatusPriority(row.agreement?.status ?? '', row.hasLegacySigned),
        label: getReleaseStatusLabel(row.agreement, row.hasLegacySigned),
      }),
      sortingFn: (a, b) => {
        const aValue = a.getValue<{ priority: number; label: string }>('status')
        const bValue = b.getValue<{ priority: number; label: string }>('status')
        const aPriority = aValue?.priority ?? getStatusPriority(a.original.agreement?.status ?? '', a.original.hasLegacySigned)
        const bPriority = bValue?.priority ?? getStatusPriority(b.original.agreement?.status ?? '', b.original.hasLegacySigned)
        if (aPriority !== bPriority) {
          return aPriority - bPriority
        }
        const aLabel = aValue?.label ?? getReleaseStatusLabel(a.original.agreement, a.original.hasLegacySigned)
        const bLabel = bValue?.label ?? getReleaseStatusLabel(b.original.agreement, b.original.hasLegacySigned)
        return aLabel.localeCompare(bLabel)
      },
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-auto p-0 font-medium text-left hover:bg-transparent"
        >
          Release Status
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
        const { agreement, hasLegacySigned } = row.original;
        return renderStatusBadge(agreement, hasLegacySigned);
      },
    },
    {
      id: "lastActivity",
      accessorFn: (row) => {
        const { agreement } = row
        if (!agreement) return null
        const isSigned = agreement.status === 'completed' || agreement.status === 'completed_manual'
        const signedAt = isSigned ? agreement.updated_at : null
        return signedAt ?? agreement.created_at ?? null
      },
      sortingFn: (a, b) => {
        const aValue = a.getValue<string | null>("lastActivity")
        const bValue = b.getValue<string | null>("lastActivity")
        if (!aValue && !bValue) return 0
        if (!aValue) return 1
        if (!bValue) return -1
        const aTime = new Date(aValue).getTime()
        const bTime = new Date(bValue).getTime()
        if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0
        if (Number.isNaN(aTime)) return 1
        if (Number.isNaN(bTime)) return -1
        return aTime - bTime
      },
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-auto p-0 font-medium text-left hover:bg-transparent"
        >
          Last Activity
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
        const { agreement } = row.original
        if (!agreement) return <span className="text-meta-muted">-</span>

        const sentDate = agreement.created_at ? new Date(agreement.created_at) : null
        const isSigned = agreement.status === 'completed' || agreement.status === 'completed_manual'
        const signedDate = isSigned && agreement.updated_at ? new Date(agreement.updated_at) : null

        const formatDate = (date: Date | null) => {
          if (!date || Number.isNaN(date.getTime())) return null
          return date.toLocaleDateString()
        }

        const signedLabel = formatDate(signedDate)
        const sentLabel = formatDate(sentDate)
        const displayLabel = signedLabel ? 'Signed' : 'Sent'
        const displayDate = signedLabel ?? sentLabel

        if (!displayDate) {
          return <span className="text-meta-muted">-</span>
        }

        return <div className="text-sm text-meta-light">{`${displayLabel} ${displayDate}`}</div>
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const { competitor, agreement, hasLegacySigned } = row.original;
        const disableAdminAll = isAdmin && !ctxLoading && coachId === null // admin in All-coaches → disable
        const isSignedStatus = agreement?.status === 'completed' || agreement?.status === 'completed_manual'
        
        return (
          <div className="flex items-center space-x-2">
            {agreement?.signed_pdf_path && isSignedStatus && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadPDF(agreement.signed_pdf_path!, `${competitor.first_name} ${competitor.last_name}`)}
                className="text-meta-light border-meta-border hover:bg-meta-accent"
                disabled={disableAdminAll}
                title={disableAdminAll ? 'Select a coach to edit' : undefined}
              >
                <Download className="h-4 w-4 mr-1" />
                PDF
              </Button>
            )}
            
            {agreement && agreement.status === 'print_ready' && (
              <>
                {agreement.signed_pdf_path ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => downloadPDF(agreement.signed_pdf_path!, `${competitor.first_name} ${competitor.last_name} - Print Ready`)}
                    className="text-meta-light border-meta-border hover:bg-meta-accent"
                    disabled={disableAdminAll}
                    title={disableAdminAll ? 'Select a coach to edit' : undefined}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Download Print
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-meta-muted border-meta-border"
                    disabled
                    title="Generating PDF; refresh shortly"
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Generating…
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openUploadModal(agreement)}
                  className="text-meta-light border-meta-border hover:bg-meta-accent"
                  disabled={disableAdminAll || uploading}
                  title={disableAdminAll ? 'Select a coach to edit' : undefined}
                >
                  <Upload className="h-4 w-4 mr-1" />
                  Upload Signed
                </Button>
              </>
            )}
            
            {agreement && agreement.status === 'sent' && agreement.metadata?.mode === 'print' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => openUploadModal(agreement)}
                disabled={disableAdminAll || uploading}
                className="text-meta-light border-meta-border hover:bg-meta-accent"
                title={disableAdminAll ? 'Select a coach to edit' : undefined}
              >
                <Upload className="h-4 w-4 mr-1" />
                Upload Signed
              </Button>
            )}

            {agreement && ['sent', 'viewed', 'print_ready'].includes(agreement.status) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => cancelAgreement(agreement, competitor)}
                disabled={disableAdminAll || canceling === agreement.id}
                className="text-meta-light border-meta-border hover:bg-meta-accent"
                title={disableAdminAll ? 'Select a coach to edit' : 'Cancel digital flow and reset'}
              >
                {canceling === agreement.id ? (
                  <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Ban className="h-4 w-4 mr-1" />
                )}
                Cancel & Reset
              </Button>
            )}
            
            {!agreement && !hasLegacySigned && (
              <>
                <Button
                  size="sm"
                  onClick={() => sendRelease(competitor.id, 'email')}
                  disabled={disableAdminAll || sending === competitor.id}
                  className="bg-meta-accent hover:bg-meta-accent/90 text-white"
                  aria-disabled={disableAdminAll || sending === competitor.id}
                  title={disableAdminAll ? 'Select a coach to edit' : 'Send for digital signature'}
                >
                  {sending === competitor.id ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-1" />
                      Send
                    </>
                  )}
                </Button>
                
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => sendRelease(competitor.id, 'print')}
                  disabled={disableAdminAll || sending === competitor.id}
                  className="text-meta-light border-meta-border hover:bg-meta-accent"
                  aria-disabled={disableAdminAll || sending === competitor.id}
                  title={disableAdminAll ? 'Select a coach to edit' : 'For manual signature and upload'}
                >
                 <FileText className="h-4 w-4 mr-1" />
                 Print Pre-filled
                </Button>
              </>
            )}
          </div>
        );
      },
    },
  ];

  useEffect(() => {
    if (isAdmin && !coachId) return
    setVisibleCount(40)
  }, [searchTerm, hideCompleted, competitors.length, agreements.length, isAdmin, coachId])

  useEffect(() => {
    if (!(isAdmin && !coachId)) return
    setVisibleCount(releaseData.length)
  }, [isAdmin, coachId, releaseData.length])

  useEffect(() => {
    if (isAdmin && !coachId) return
    const node = sentinelRef.current
    if (!node) return
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + 20, releaseData.length))
        }
      }
    }, { root: null, rootMargin: '200px', threshold: 0 })
    obs.observe(node)
    return () => obs.disconnect()
  }, [isAdmin, coachId, releaseData.length])

  useEffect(() => {
    if (!(isAdmin && !coachId)) return
    const node = sentinelRef.current
    if (!node) return
    const rootEl = typeof window !== 'undefined' ? getScrollParent(node) : null
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        if (!releaseLoadingRef.current && (releaseTotal === null || releaseOffset < releaseTotal)) {
          void fetchMoreReleases()
        }
      }
    }, { root: rootEl || null, rootMargin: '200px', threshold: 0 })
    obs.observe(node)
    return () => obs.disconnect()
  }, [isAdmin, coachId, fetchMoreReleases, releaseOffset, releaseTotal])

  useEffect(() => {
    if (!(isAdmin && !coachId)) return
    const node = sentinelRef.current
    const rootEl = node ? getScrollParent(node) : null

    const handleScroll = () => {
      if (releaseLoadingRef.current) return
      if (releaseTotal !== null && releaseOffset >= releaseTotal) return

      const nearBottom = rootEl
        ? rootEl.scrollTop + rootEl.clientHeight >= rootEl.scrollHeight - 200
        : window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 200

      if (nearBottom) {
        void fetchMoreReleases()
      }
    }

    const target: any = rootEl || window
    target.addEventListener('scroll', handleScroll)
    target.addEventListener('resize', handleScroll)
    handleScroll()
    return () => {
      target.removeEventListener('scroll', handleScroll)
      target.removeEventListener('resize', handleScroll)
    }
  }, [isAdmin, coachId, fetchMoreReleases, releaseOffset, releaseTotal])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-8 w-8 animate-spin text-meta-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-4">
        <div>
          <h1 className="text-3xl font-bold text-meta-light">Release Management</h1>
          <div className="text-meta-muted mt-2 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-yellow-300">ATTENTION:</span>
              <span className="text-meta-light">Only competitors with a status of</span>
              <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800">profile</span>
              <span className="text-meta-light">or higher appear here.</span>
            </div>
            <p>Manage release forms and track signing status. Only active competitors with complete profiles are listed.</p>
            <div className="text-sm">
              <div className="text-meta-light font-medium">How to send:</div>
              <div>- Digital send: Click Send Release (Email) to email the signer.</div>
              <div>- Manual send: 1) Click Print Pre-filled to generate a pre-filled PDF, 2) click the pdf download button, 3) print the form, 4) have it signed on paper, 6) then upload it via “Upload Signed Document”.</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-meta-card border-meta-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-meta-light">Total Competitors</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-meta-light">{totalCompetitorsCount}</div>
                <p className="text-xs text-meta-muted">
                  All competitors on your roster.
                </p>
                <p className="text-[11px] text-meta-muted mt-1">
                  Release-eligible loaded: {releaseLoadedCount}{releaseEligibleTotal !== releaseLoadedCount ? ` of ${releaseEligibleTotal}` : ''}.
                </p>
              </CardContent>
            </Card>
            <Card className="bg-meta-card border-meta-border md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-meta-light">Release Status Legend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-[11px] text-meta-muted mb-3 grid grid-cols-2 gap-y-1 gap-x-4">
                  <div><span className="text-meta-light">Not Sent:</span> No release has been issued yet.</div>
                  <div><span className="text-meta-light">Sent:</span> Release dispatched and awaiting completion.</div>
                  <div><span className="text-meta-light">Signed:</span> Completed release (digital, manual upload, or legacy paperwork).</div>
                  <div className="col-span-2 text-meta-muted">
                    <span className="text-meta-light">Signed breakdown:</span>
                    {' '}
                    Signed Digitally {releaseStatusCounts.signedDigitally} • Signed Manually {releaseStatusCounts.signedManually} • Signed Legacy {releaseStatusCounts.signedLegacy}
                  </div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="bg-meta-dark rounded p-3">
                    <div className="text-xs text-meta-muted">Not Sent</div>
                    <div className="text-xl font-bold text-rose-300">{releaseStatusCounts.notSent}</div>
                  </div>
                  <div className="bg-meta-dark rounded p-3">
                    <div className="text-xs text-meta-muted">Sent</div>
                    <div className="text-xl font-bold text-blue-300">{releaseStatusCounts.sent}</div>
                  </div>
                  <div className="bg-meta-dark rounded p-3">
                    <div className="text-xs text-meta-muted">Signed</div>
                    <div className="text-xl font-bold text-emerald-300">{releaseStatusCounts.signedTotal}</div>
                  </div>
                </div>
                <p className="text-[11px] text-meta-muted mt-3">
                  Totals align with release queue ({releaseStatusCounts.notSent + releaseStatusCounts.sent + releaseStatusCounts.signedTotal} of {releaseEligibleTotal} release-eligible competitors).
                </p>
              </CardContent>
            </Card>
          </div>
          <ActingAsBanner />
        </div>
      </div>

      <Card className="bg-meta-card border-meta-border">
        <CardHeader>
          <CardTitle className="text-meta-light">Competitors & Release Status</CardTitle>
          <div className="mt-4 flex items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-2 text-sm text-meta-light">
                <input
                  type="checkbox"
                  checked={hideCompleted}
                  onChange={(e) => setHideCompleted(e.target.checked)}
                  className="rounded border-meta-border bg-meta-card text-meta-accent focus:ring-meta-accent"
                />
                <span>Show Only Uncompleted Releases</span>
              </label>
            </div>
            <div className="text-sm text-meta-muted whitespace-nowrap">
              Showing {displayedCount} of {totalCount}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={releaseData.slice(0, isAdminAll ? releaseData.length : visibleCount)}
          />
          <div ref={sentinelRef} />
        </CardContent>
      </Card>
      
      {/* Upload Modal */}
      {uploadModalOpen && selectedAgreement && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-meta-dark border border-meta-border rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-meta-light mb-4">
              Upload Signed Document
            </h3>
            <p className="text-sm text-meta-muted mb-4">
              Please upload the signed document for {selectedAgreement.competitor_id ? 
                competitors.find(c => c.id === selectedAgreement.competitor_id)?.first_name + ' ' + 
                competitors.find(c => c.id === selectedAgreement.competitor_id)?.last_name : 'this competitor'}.
            </p>
            
            <div className="space-y-4">
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
                disabled={uploading}
                className="bg-meta-dark border-meta-border text-meta-light"
              />
              
              <div className="flex space-x-2">
                <Button
                  onClick={() => {
                    setUploadModalOpen(false);
                    setSelectedAgreement(null);
                  }}
                  variant="outline"
                  className="flex-1 text-meta-light border-meta-border hover:bg-meta-accent"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => setUploadModalOpen(false)}
                  disabled={uploading}
                  className="flex-1 bg-meta-accent hover:bg-meta-accent/90 text-white"
                >
                  {uploading ? 'Uploading...' : 'Close'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
