'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Send, 
  FileText, 
  CheckCircle, 
  Clock, 
  XCircle, 
  AlertCircle,
  Download,
  RefreshCw
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
}

interface Agreement {
  id: string;
  competitor_id: string;
  template_kind: 'adult' | 'minor';
  status: 'sent' | 'viewed' | 'completed' | 'declined' | 'expired';
  request_id: string;
  signed_pdf_path: string | null;
  created_at: string;
  updated_at: string;
}

export default function ReleaseManagementPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch competitors
      const { data: competitorsData } = await supabase
        .from('competitors')
        .select('*')
        .order('first_name', { ascending: true });

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

  const sendRelease = async (competitorId: string, mode: 'email' | 'inperson' = 'email') => {
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

  const getAgreementStatus = (competitorId: string) => {
    const agreement = agreements.find(a => a.competitor_id === competitorId);
    return agreement;
  };

  const filteredCompetitors = competitors.filter(competitor =>
    competitor.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    competitor.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    competitor.school?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    competitor.grade?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: string, templateKind?: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-600 text-white"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      case 'sent':
        return <Badge className="bg-blue-600 text-white"><Clock className="h-3 w-3 mr-1" />Sent</Badge>;
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

  const downloadPDF = async (signedPdfPath: string, competitorName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('signatures')
        .download(signedPdfPath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${competitorName}-signed-release.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      alert('Failed to download PDF. Please try again.');
    }
  };

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
          <p className="text-meta-muted mt-2">Manage release forms and track signing status</p>
        </div>
        <Button onClick={fetchData} variant="outline" className="text-meta-light border-meta-border">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Card className="bg-meta-card border-meta-border">
        <CardHeader>
          <CardTitle className="text-meta-light">Competitors & Release Status</CardTitle>
        <div className="mt-4">
          <Input
            placeholder="Search competitors by name, school, or grade..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-md bg-meta-dark border-meta-border text-meta-light placeholder:text-meta-muted"
          />
        </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredCompetitors.map((competitor) => {
              const agreement = getAgreementStatus(competitor.id);
              const hasSigned = competitor.is_18_or_over 
                ? competitor.participation_agreement_date 
                : competitor.media_release_date;

              return (
                <div key={competitor.id} className="flex items-center justify-between p-4 bg-meta-dark rounded-lg border border-meta-border">
                  <div className="flex-1">
                    <div className="flex items-center space-x-4">
                      <div>
                        <h3 className="font-semibold text-meta-light">
                          {competitor.first_name} {competitor.last_name}
                        </h3>
                        <p className="text-sm text-meta-muted">
                          {competitor.grade} • {competitor.school}
                        </p>
                        <p className="text-xs text-meta-muted">
                          {competitor.is_18_or_over ? 'Adult' : 'Minor'} • 
                          {competitor.is_18_or_over ? ` ${competitor.email_school}` : ` ${competitor.parent_email}`}
                        </p>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {agreement ? (
                          getStatusBadge(agreement.status, agreement.template_kind)
                        ) : hasSigned ? (
                          <Badge className="bg-green-600 text-white">
                            <CheckCircle className="h-3 w-3 mr-1" />Legacy Signed
                          </Badge>
                        ) : (
                          <Badge variant="outline">No Release</Badge>
                        )}
                      </div>
                    </div>
                  </div>

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
                    
                    {!agreement && !hasSigned && (
                      <>
                        <Button
                          size="sm"
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
                          onClick={() => sendRelease(competitor.id, 'inperson')}
                          disabled={sending === competitor.id}
                          className="text-meta-light border-meta-border hover:bg-meta-accent"
                        >
                          <FileText className="h-4 w-4 mr-1" />
                          In-Person
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
