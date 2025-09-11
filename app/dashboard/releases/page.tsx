'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
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
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [hideCompleted, setHideCompleted] = useState(true);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedAgreement, setSelectedAgreement] = useState<Agreement | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch competitors - coaches only see their own, admins see all
      const { data: { user } } = await supabase.auth.getUser();
      let competitorsQuery = supabase
        .from('competitors')
        .select('*')
        .order('first_name', { ascending: true });

      // If user is not admin, filter by coach_id
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        
        if (profile?.role !== 'admin') {
          competitorsQuery = competitorsQuery.eq('coach_id', user.id);
        }
      }

      const { data: competitorsData } = await competitorsQuery;

      // Fetch agreements
      const { data: agreementsData } = await supabase
        .from('agreements')
        .select('*')
        .order('created_at', { ascending: false });

      if (competitorsData) setCompetitors(competitorsData);
      if (agreementsData) setAgreements(agreementsData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendRelease = async (competitorId: string, mode: 'email' | 'print' = 'email') => {
    try {
      setSending(competitorId);
      
      const response = await fetch('/api/zoho/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competitorId, mode }),
      });

      if (!response.ok) {
        throw new Error('Failed to send release');
      }

      // Refresh data to show new agreement
      await fetchData();
    } catch (error) {
      console.error('Error sending release:', error);
      alert('Failed to send release. Please try again.');
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

  // Filter competitors to only show active ones with status 'profile' or higher
  const filteredCompetitors = competitors.filter(competitor => {
    if (!competitor.is_active) return false;
    
    const statusOrder = ['pending', 'profile', 'compliance', 'complete'];
    const competitorStatusIndex = statusOrder.indexOf(competitor.status);
    const profileIndex = statusOrder.indexOf('profile');
    
    if (competitorStatusIndex < profileIndex) return false;
    
    return competitor.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           competitor.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           competitor.school?.toLowerCase().includes(searchTerm.toLowerCase()) ||
           competitor.grade?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  // Create release data for table
  const releaseData: ReleaseData[] = filteredCompetitors.map(competitor => {
    const agreement = agreements.find(a => a.competitor_id === competitor.id);
    const hasLegacySigned = competitor.is_18_or_over 
      ? !!competitor.participation_agreement_date 
      : !!competitor.media_release_date;
    
    return {
      competitor,
      agreement,
      hasLegacySigned
    };
  }).filter(item => {
    // Filter out completed releases if toggle is enabled
    if (hideCompleted) {
      const isCompleted = item.agreement?.status === 'completed' || 
                         item.agreement?.status === 'completed_manual' || 
                         item.hasLegacySigned;
      return !isCompleted;
    }
    return true;
  });

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
        
        return (
          <div className="flex items-center space-x-2">
            {agreement?.signed_pdf_path && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadPDF(agreement.signed_pdf_path!, `${competitor.first_name} ${competitor.last_name}`)}
                className="text-meta-light border-meta-border hover:bg-meta-accent"
              >
                <Download className="h-4 w-4 mr-1" />
                PDF
              </Button>
            )}
            
            {agreement && agreement.status === 'print_ready' && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => downloadPDF(agreement.signed_pdf_path!, `${competitor.first_name} ${competitor.last_name} - Print Ready`)}
                  className="text-meta-light border-meta-border hover:bg-meta-accent"
                >
                  <Download className="h-4 w-4 mr-1" />
                  Download Print
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openUploadModal(agreement)}
                  disabled={uploading}
                  className="text-meta-light border-meta-border hover:bg-meta-accent"
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
                disabled={uploading}
                className="text-meta-light border-meta-border hover:bg-meta-accent"
              >
                <Upload className="h-4 w-4 mr-1" />
                Upload Signed
              </Button>
            )}
            
            {!agreement && !hasLegacySigned && (
              <>
                <Button
                  size="sm"
                  title="Send for digital signature"
                  onClick={() => sendRelease(competitor.id, 'email')}
                  disabled={sending === competitor.id}
                  className="bg-meta-accent hover:bg-meta-accent/90 text-white"
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
                  title="For manual signature and upload"
                  onClick={() => sendRelease(competitor.id, 'print')}
                  disabled={sending === competitor.id}
                  className="text-meta-light border-meta-border hover:bg-meta-accent"
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
          <p className="text-meta-muted mt-2">
            Manage release forms and track signing status. Only active competitors with complete profiles (status: profile or higher) are shown.
          </p>
        </div>
        <Button onClick={fetchData} variant="outline" className="text-meta-light border-meta-border">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Card className="bg-meta-card border-meta-border">
        <CardHeader>
          <CardTitle className="text-meta-light">Competitors & Release Status</CardTitle>
          <div className="mt-4 flex items-center space-x-4">
            <Input
              placeholder="Search competitors by name, school, or grade..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-md bg-meta-dark border-meta-border text-meta-light placeholder:text-meta-muted"
            />
            <label className="flex items-center space-x-2 text-sm text-meta-light">
              <input
                type="checkbox"
                checked={!hideCompleted}
                onChange={(e) => setHideCompleted(!e.target.checked)}
                className="rounded border-meta-border bg-meta-card text-meta-accent focus:ring-meta-accent"
              />
              <span>Show Completed Releases</span>
            </label>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={releaseData} />
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
