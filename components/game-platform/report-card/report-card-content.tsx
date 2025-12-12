'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ReportCardHeader from './report-card-header';
import PerformanceOverview from './performance-overview';
import DomainStrengthChart from './domain-strength-chart';
import ChallengesTable from './challenges-table';
import FlashCtfEvents from './flash-ctf-events';
import InsightsPanel from './insights-panel';
import ActivityHeatmap from './activity-heatmap';
import DomainSpiderChart from './domain-spider-chart';
import CumulativePointsChart from './cumulative-points-chart';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FileDown } from 'lucide-react';

interface ReportCardData {
  competitor: any;
  summary: any;
  domains: any[];
  recentChallenges: any[];
  flashCtfEvents: any[];
  activityTimeline: any[];
  insights: any[];
  nistCoverage: any;
}

export default function ReportCardContent({ competitorId }: { competitorId: string }) {
  const router = useRouter();
  const [data, setData] = useState<ReportCardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if we're in PDF mode and what sections to show
  const isPdfMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('pdf') === 'true';
  const sectionsParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('sections') : null;
  const visibleSections = new Set(sectionsParam?.split(',') || [
    'header', 'performance', 'insights', 'domains', 'spider', 'cumulative', 'flash-ctf', 'nist', 'activity', 'challenges'
  ]);

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch(`/api/game-platform/report-card/${competitorId}`);

        if (!response.ok) {
          throw new Error(response.status === 404 ? 'Competitor not found' : 'Failed to load report');
        }

        const result = await response.json();
        setData(result);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [competitorId]);

  if (loading) {
    return <div className="text-center py-12">Loading report card...</div>;
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">{error}</p>
        <Button onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Go Back
        </Button>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const handleDownloadPDF = async () => {
    try {
      const response = await fetch(`/api/game-platform/report-card/${competitorId}/pdf`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('PDF generation failed:', errorData);
        throw new Error(errorData.error || 'Failed to generate PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.competitor.name.replace(/[^a-zA-Z0-9]/g, '_')}_Report_Card.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: any) {
      console.error('Error downloading PDF:', error);
      alert(`Failed to download PDF: ${error.message}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with actions */}
      {!isPdfMode && (
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          <div className="flex gap-2 print:hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownloadPDF}
              title="Download as PDF"
            >
              <FileDown className="h-5 w-5" />
            </Button>
          </div>
        </div>
      )}

      {/* Header Card */}
      {visibleSections.has('header') && (
        <div data-section="header">
          <ReportCardHeader competitor={data.competitor} summary={data.summary} />
        </div>
      )}

      {/* Show sync pending message if not synced */}
      {!data.competitor.gamePlatformSynced && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <h3 className="text-lg font-semibold text-yellow-900 mb-2">Sync Required</h3>
          <p className="text-yellow-700">
            This competitor hasn&apos;t been synced with the Game Platform yet.
            Contact your administrator to enable syncing.
          </p>
        </div>
      )}

      {data.competitor.gamePlatformSynced && (
        <>
          {/* Performance Overview Cards */}
          {visibleSections.has('performance') && (
            <div data-section="performance">
  <PerformanceOverview summary={data.summary} />
            </div>
          )}

          {/* Insights */}
          {visibleSections.has('insights') && data.insights.length > 0 && (
            <div data-section="insights">
              <InsightsPanel insights={data.insights} />
            </div>
          )}

          {/* Flash CTF and NIST Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-section="flash-nist-row">
            {/* Flash CTF Events */}
            {visibleSections.has('flash-ctf') && (
              data.flashCtfEvents.length > 0 ? (
                <FlashCtfEvents events={data.flashCtfEvents} />
              ) : (
                <div className="border rounded-lg p-6 flex flex-col justify-center items-center text-center text-sm text-muted-foreground h-full">
                  <h3 className="text-lg font-semibold mb-2">Flash CTF Participation</h3>
                  <p className="text-muted-foreground">No MetaCTF Flash CTF activity recorded yet.</p>
                </div>
              )
            )}

            {/* NIST Coverage */}
            {visibleSections.has('nist') && data.nistCoverage.totalRoles > 0 && (
              <div className="border rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4">NIST Work Role Coverage</h3>
                <div className="text-center mb-4">
                  <div className="text-4xl font-bold text-blue-600">
                    {data.nistCoverage.coveragePercent}%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {data.nistCoverage.totalRoles} roles covered
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {data.nistCoverage.rolesCovered.map((role: { code: string; name: string }) => (
                    <div
                      key={role.code}
                      className="w-full px-3 py-2 rounded-md text-sm bg-blue-50 text-blue-900 border border-blue-200"
                      title={role.code}
                    >
                      {role.name}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Domain Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-section="domain-charts">
            {/* Domain Strength */}
            {visibleSections.has('domains') && data.domains.length > 0 && (
              <DomainStrengthChart domains={data.domains} />
            )}

            {/* Spider Chart */}
            {visibleSections.has('spider') && data.domains.length > 0 && (
              <DomainSpiderChart domains={data.domains} />
            )}
          </div>

          {/* Full Width Charts */}
          {visibleSections.has('cumulative') && data.activityTimeline.length > 0 && (
            <div data-section="cumulative">
              <CumulativePointsChart timeline={data.activityTimeline} />
            </div>
          )}

          {visibleSections.has('activity') && data.activityTimeline.length > 0 && (
            <div data-section="activity">
              <ActivityHeatmap timeline={data.activityTimeline} />
            </div>
          )}

          {/* Full Width Challenge History */}
          {visibleSections.has('challenges') && data.recentChallenges.length > 0 && (
            <div data-section="challenges">
              <ChallengesTable challenges={data.recentChallenges} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
