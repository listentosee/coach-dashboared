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
  ChevronUp,
  ChevronDown,
  ChevronsUpDown
} from 'lucide-react';

interface Competitor {
  id: string;
  first_name: string;
  last_name: string;
  grade: string;
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [visibleCount, setVisibleCount] = useState(40)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const [analytics, setAnalytics] = useState<{ competitorCount?: number; teamCount?: number; statusCounts?: any } | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Determine role and load via API for admin (server-filtered); otherwise direct for coach
      const { data: { user } } = await supabase.auth.getUser();
      let role: string | null = null
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        role = (profile as any)?.role || null
        setIsAdmin(role === 'admin')
      }

      if (role === 'admin') {
        const r = await fetch('/api/admin/releases')
        if (r.ok) {
          const j = await r.json()
          setCompetitors(j.competitors || [])
          setAgreements(j.agreements || [])
        } else {
          setCompetitors([])
          setAgreements([])
        }
        // Fetch analytics totals for header panels (DB totals, not on-screen slice)
        try {
          const aUrl = coachId ? `/api/admin/analytics?coach_id=${coachId}` : '/api/admin/analytics'
          const ar = await fetch(aUrl)
          if (ar.ok) {
            const aj = await ar.json()
            setAnalytics({ competitorCount: aj?.totals?.competitorCount, teamCount: aj?.totals?.teamCount, statusCounts: aj?.statusCounts })
          } else {
            setAnalytics(null)
          }
        } catch { setAnalytics(null) }
      } else {
        // Coach: scoped client-side
        const { data: competitorsData } = await supabase
          .from('competitors')
          .select('*')
          .eq('coach_id', user?.id as string)
          .order('first_name', { ascending: true })
        const { data: agreementsData } = await supabase
          .from('agreements')
          .select('*')
          .order('created_at', { ascending: false })
        setCompetitors(competitorsData || [])
        setAgreements(agreementsData || [])
        // Compute simple totals for coach header
        const list = competitorsData || []
        const statusCount = (s: string) => list.filter((c: any) => c.status === s).length
        setAnalytics({
          competitorCount: list.length,
          teamCount: 0,
          statusCounts: {
            pending: statusCount('pending'),
            profile: statusCount('profile'),
            compliance: statusCount('compliance'),
            complete: statusCount('complete')
          }
        })
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [coachId]);

  // Initial and context-based fetch
  useEffect(() => {
    if (!ctxLoading) fetchData();
  }, [ctxLoading, fetchData])

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
      await fetchData();
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
        throw new Error('Failed to upload file');
      }

      // Refresh data and close modal
      await fetchData();
      setUploadModalOpen(false);
      setSelectedAgreement(null);
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Failed to upload file. Please try again.');
    } finally {
      setUploading(false);
    }
  };

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

  const getStatusBadge = (status: string, templateKind?: string, completionSource?: string) => {
    switch (status) {
      case 'completed':
        if (completionSource === 'manual') {
          return <Badge className="bg-orange-600 text-white"><CheckCircle className="h-3 w-3 mr-1" />Completed (Manual)</Badge>;
        }
        return <Badge className="bg-green-600 text-white"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      case 'completed_manual':
        return <Badge className="bg-orange-600 text-white"><CheckCircle className="h-3 w-3 mr-1" />Completed (Manual)</Badge>;
      case 'sent':
        return <Badge className="bg-blue-600 text-white"><Clock className="h-3 w-3 mr-1" />Sent</Badge>;
      case 'print_ready':
        return <Badge className="bg-purple-600 text-white"><FileText className="h-3 w-3 mr-1" />Print Ready</Badge>;
      case 'viewed':
        return <Badge className="bg-yellow-600 text-white"><FileText className="h-3 w-3 mr-1" />Viewed</Badge>;
      case 'declined':
        return <Badge className="bg-red-600 text-white"><XCircle className="h-3 w-3 mr-1" />Declined</Badge>;
      case 'expired':
        return <Badge className="bg-gray-600 text-white"><AlertCircle className="h-3 w-3 mr-1" />Expired</Badge>;
      default:
        return <Badge variant="outline">No Release</Badge>;
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

  const releaseUniverse: ReleaseData[] = useMemo(() => {
    return eligibleCompetitors.map(competitor => {
      const agreement = agreements.find(a => a.competitor_id === competitor.id)
      const hasLegacySigned = competitor.is_18_or_over
        ? !!competitor.participation_agreement_date
        : !!competitor.media_release_date
      return { competitor, agreement, hasLegacySigned }
    })
  }, [eligibleCompetitors, agreements])

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
        return (
          <div>
            <div className="font-medium text-meta-light">
              {competitor.first_name} {competitor.last_name}
            </div>
            <div className="text-sm text-meta-muted">
              {competitor.grade} • {competitor.school}
            </div>
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
      header: "Release Status",
      cell: ({ row }) => {
        const { agreement, hasLegacySigned } = row.original;
        
        if (agreement) {
          return getStatusBadge(agreement.status, agreement.template_kind, agreement.completion_source);
        } else if (hasLegacySigned) {
          return <Badge className="bg-green-600 text-white"><CheckCircle className="h-3 w-3 mr-1" />Legacy Signed</Badge>;
        } else {
          return <Badge variant="outline">No Release</Badge>;
        }
      },
    },
    {
      accessorKey: "agreement.created_at",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-auto p-0 font-medium text-left hover:bg-transparent"
        >
          Sent Date
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
        const { agreement } = row.original;
        if (!agreement) return <span className="text-meta-muted">-</span>;
        
        return (
          <div className="text-sm text-meta-light">
            {new Date(agreement.created_at).toLocaleDateString()}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const { competitor, agreement, hasLegacySigned } = row.original;
        const disableAdminAll = isAdmin && !ctxLoading && coachId === null // admin in All-coaches → disable
        
        return (
          <div className="flex items-center space-x-2">
            {agreement?.signed_pdf_path && (
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

  // Reset paging when filters/data change (must not be conditional)
  useEffect(() => { setVisibleCount(40) }, [searchTerm, hideCompleted, competitors.length, agreements.length])
  // Infinite scroll sentinel (must not be conditional)
  useEffect(() => {
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
  }, [releaseData.length])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-8 w-8 animate-spin text-meta-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
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
            {(() => {
              // Represent the Release Status distribution across all eligible rows
              const counts = {
                no_release: 0,
                sent: 0,
                viewed: 0,
                print_ready: 0,
                completed: 0,
                completed_manual: 0,
                legacy_signed: 0,
                declined: 0,
                expired: 0,
              }

              for (const item of releaseUniverse) {
                if (item.agreement) {
                  const s = item.agreement.status as keyof typeof counts
                  if (counts[s] !== undefined) counts[s] += 1
                  else counts.no_release += 1
                } else if (item.hasLegacySigned) {
                  counts.legacy_signed += 1
                } else {
                  counts.no_release += 1
                }
              }

              const total = Math.max(1, releaseUniverse.length)
              const pct = (n: number) => (n / total) * 100
              const segments = [
                { key: 'no_release',       label: 'No Release',         count: counts.no_release,       bg: 'bg-slate-600',  text: 'text-white' },
                { key: 'sent',             label: 'Sent',               count: counts.sent,             bg: 'bg-blue-600',   text: 'text-white' },
                { key: 'viewed',           label: 'Viewed',             count: counts.viewed,           bg: 'bg-yellow-600', text: 'text-white' },
                { key: 'print_ready',      label: 'Print Ready',        count: counts.print_ready,      bg: 'bg-purple-600', text: 'text-white' },
                { key: 'completed',        label: 'Completed',          count: counts.completed,        bg: 'bg-green-600',  text: 'text-white' },
                { key: 'completed_manual', label: 'Completed (Manual)', count: counts.completed_manual, bg: 'bg-orange-600', text: 'text-white' },
                { key: 'legacy_signed',    label: 'Legacy Signed',      count: counts.legacy_signed,    bg: 'bg-green-700',  text: 'text-white' },
                { key: 'declined',         label: 'Declined',           count: counts.declined,         bg: 'bg-red-600',    text: 'text-white' },
                { key: 'expired',          label: 'Expired',            count: counts.expired,          bg: 'bg-gray-600',   text: 'text-white' },
              ]
              const visible = segments.filter(s => s.count > 0)
              return (
                <div className="mt-3">
                  <div className="w-full rounded overflow-hidden flex border border-meta-border">
                    {visible.length === 0 ? (
                      <div className="w-full py-2 text-center text-xs text-meta-muted">No release rows to display</div>
                    ) : (
                      visible.map(s => (
                        <div
                          key={s.key}
                          className={`flex items-center justify-center px-2 py-1 whitespace-nowrap ${s.bg} ${s.text}`}
                          style={{ width: `${Math.max(6, pct(s.count))}%`, minWidth: 80 }}
                          title={`${s.label} ${s.count}`}
                        >
                          <span className="text-[11px] font-semibold truncate">{s.label} {s.count}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )
            })()}
            <div className="text-sm">
              <div className="text-meta-light font-medium">How to send:</div>
              <div>- Digital send: Click Send Release (Email) to email the signer.</div>
              <div>- Manual send: 1) Click Send Release (Print) to generate a pre-filled PDF, 2) click the pdf download button, 3) print the form, 4) have it signed on paper, 6) then upload it via “Upload Signed Document”.</div>
            </div>
          </div>
          <ActingAsBanner />
        </div>
        <Button onClick={fetchData} variant="outline" className="text-meta-light border-meta-border">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
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
              Showing {Math.min(visibleCount, releaseData.length)} of {releaseData.length}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={releaseData.slice(0, visibleCount)} />
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
