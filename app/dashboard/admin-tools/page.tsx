'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { 
  CheckCircle, 
  Clock, 
  AlertCircle,
  Download,
  RefreshCw,
  Settings
} from 'lucide-react';

interface Agreement {
  id: string;
  competitor_id: string;
  provider: string;
  template_kind: string;
  request_id: string;
  status: string;
  signed_pdf_path: string | null;
  created_at: string;
  updated_at: string;
  metadata: any;
  zoho_completed: boolean;
}

interface Competitor {
  id: string;
  first_name: string;
  last_name: string;
  grade: string;
  school: string;
}

export default function AdminToolsPage() {
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string[]>([]);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    checkUserRole();
  }, []);

  const checkUserRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAccessDenied(true);
        return;
      }

      // Check if user has admin role (you'll need to implement this based on your auth system)
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile?.role !== 'admin') {
        setAccessDenied(true);
        return;
      }

      setUserRole(profile.role);
      fetchData();
    } catch (error) {
      console.error('Error checking user role:', error);
      setAccessDenied(true);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch manually completed agreements
      const { data: agreementsData } = await supabase
        .from('agreements')
        .select('*')
        .eq('status', 'completed')
        .eq('provider', 'zoho')
        .order('updated_at', { ascending: false });

      // Fetch competitors for display
      const { data: competitorsData } = await supabase
        .from('competitors')
        .select('id, first_name, last_name, grade, school')
        .order('first_name', { ascending: true });

      if (agreementsData) setAgreements(agreementsData);
      if (competitorsData) setCompetitors(competitorsData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleZohoCompletion = async (agreementId: string, completed: boolean) => {
    try {
      setProcessing(prev => [...prev, agreementId]);
      
      const { error } = await supabase
        .from('agreements')
        .update({ zoho_completed: completed })
        .eq('id', agreementId);

      if (error) {
        console.error('Failed to update Zoho completion status:', error);
        alert('Failed to update status. Please try again.');
      } else {
        // Refresh data to show updated status
        await fetchData();
      }
    } catch (error) {
      console.error('Error updating Zoho completion:', error);
      alert('Failed to update status. Please try again.');
    } finally {
      setProcessing(prev => prev.filter(id => id !== agreementId));
    }
  };

  const getCompetitorName = (competitorId: string) => {
    const competitor = competitors.find(c => c.id === competitorId);
    return competitor ? `${competitor.first_name} ${competitor.last_name}` : 'Unknown';
  };

  const getCompetitorDetails = (competitorId: string) => {
    const competitor = competitors.find(c => c.id === competitorId);
    return competitor ? `${competitor.grade} • ${competitor.school}` : '';
  };

  const downloadPDF = async (signedPdfPath: string, competitorName: string) => {
    try {
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

  if (accessDenied) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 mx-auto mb-4 text-red-500" />
          <h2 className="text-2xl font-bold text-meta-light mb-2">Access Denied</h2>
          <p className="text-meta-muted">You do not have permission to access administrative tools.</p>
        </div>
      </div>
    );
  }

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
          <h1 className="text-3xl font-bold text-meta-light">Admin Tools</h1>
          <p className="text-meta-muted mt-2">System administration and management tools</p>
        </div>
        <Button onClick={fetchData} variant="outline" className="text-meta-light border-meta-border">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Card className="bg-meta-card border-meta-border">
        <CardHeader>
          <CardTitle className="text-meta-light flex items-center">
            <Settings className="h-5 w-5 mr-2" />
            Manual Agreement Management
          </CardTitle>
          <p className="text-sm text-meta-muted">
            Manage agreements that have been manually uploaded and need Zoho completion
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {agreements.length === 0 ? (
              <div className="text-center py-8 text-meta-muted">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                <p>No manually completed agreements found.</p>
                <p className="text-sm">All agreements are properly synchronized with Zoho Sign.</p>
              </div>
            ) : (
              agreements.map((agreement) => {
                const competitorName = getCompetitorName(agreement.competitor_id);
                const competitorDetails = getCompetitorDetails(agreement.competitor_id);
                const isProcessing = processing.includes(agreement.id);

                return (
                  <div key={agreement.id} className="flex items-center justify-between p-4 bg-meta-dark rounded-lg border border-meta-border">
                    <div className="flex-1">
                      <div className="flex items-center space-x-4">
                        <div>
                          <h3 className="font-semibold text-meta-light">
                            {competitorName}
                          </h3>
                          <p className="text-sm text-meta-muted">
                            {competitorDetails}
                          </p>
                          <p className="text-xs text-meta-muted">
                            {agreement.template_kind === 'adult' ? 'Adult' : 'Minor'} • 
                            {agreement.metadata?.mode === 'print' ? ' Print Mode' : ' Email Mode'}
                          </p>
                          <p className="text-xs text-meta-muted">
                            Completed: {new Date(agreement.updated_at).toLocaleDateString()}
                          </p>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          {agreement.zoho_completed ? (
                            <Badge className="bg-green-600 text-white">
                              <CheckCircle className="h-3 w-3 mr-1" />Zoho Completed
                            </Badge>
                          ) : (
                            <Badge className="bg-yellow-600 text-white">
                              <Clock className="h-3 w-3 mr-1" />Pending Zoho
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {agreement.signed_pdf_path && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => downloadPDF(agreement.signed_pdf_path!, competitorName)}
                          className="text-meta-light border-meta-border hover:bg-meta-accent"
                        >
                          <Download className="h-4 w-4 mr-1" />
                          PDF
                        </Button>
                      )}
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`zoho-${agreement.id}`}
                          checked={agreement.zoho_completed}
                          onCheckedChange={(checked) => 
                            handleZohoCompletion(agreement.id, checked as boolean)
                          }
                          disabled={isProcessing}
                        />
                        <label 
                          htmlFor={`zoho-${agreement.id}`}
                          className="text-sm text-meta-muted cursor-pointer"
                        >
                          Zoho Complete
                        </label>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-meta-card border-meta-border">
        <CardHeader>
          <CardTitle className="text-meta-light flex items-center">
            <Settings className="h-5 w-5 mr-2" />
            System Settings
          </CardTitle>
          <p className="text-sm text-meta-muted">
            Configure system-wide settings and defaults
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-meta-light">Zoho Sign Configuration</h3>
              
              <div className="space-y-2">
                <label htmlFor="default-email" className="text-sm font-medium text-meta-light">
                  Default Email for Manual Completion
                </label>
                <p className="text-xs text-meta-muted">
                  This email address will be used when creating Zoho requests in print mode to prevent sending emails to external recipients.
                </p>
                <div className="flex items-center space-x-2">
                  <Input
                    id="default-email"
                    type="email"
                    defaultValue="cyber@syned.org"
                    className="bg-meta-dark border-meta-border text-meta-light"
                    placeholder="Enter default email address"
                  />
                  <Button 
                    size="sm"
                    onClick={() => alert('Email setting saved! (Note: This is a demo - implement actual save functionality)')}
                    className="bg-meta-accent hover:bg-meta-accent/90 text-white"
                  >
                    Save
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
