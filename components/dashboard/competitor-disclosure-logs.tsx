'use client';

/**
 * Competitor Disclosure Logs Component
 *
 * Displays FERPA-compliant disclosure history for a competitor.
 * Shows all third-party data disclosures and relevant activity.
 *
 * Required by FERPA 34 CFR § 99.32
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, ExternalLink, FileText, Shield } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface DisclosureLog {
  id: string;
  action: string;
  created_at: string;
  metadata: {
    disclosed_to?: string;
    purpose?: string;
    data_fields?: string[];
    request_id?: string;
    [key: string]: any;
  };
}

interface ActivityLog {
  id: string;
  action: string;
  created_at: string;
  metadata: Record<string, any>;
}

interface DisclosureLogsProps {
  competitorId: string;
}

export function CompetitorDisclosureLogs({ competitorId }: DisclosureLogsProps) {
  const [disclosures, setDisclosures] = useState<DisclosureLog[]>([]);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLogs() {
      try {
        const response = await fetch(`/api/competitors/${competitorId}/disclosure-log`);

        if (!response.ok) {
          throw new Error('Failed to fetch disclosure logs');
        }

        const data = await response.json();
        setDisclosures(data.disclosures || []);
        setActivity(data.activity || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchLogs();
  }, [competitorId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Disclosure Log
          </CardTitle>
          <CardDescription>Loading disclosure history...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getActionBadge = (action: string) => {
    if (action.includes('disclosed')) {
      return <Badge variant="destructive">Data Disclosure</Badge>;
    }
    if (action.includes('signed')) {
      return <Badge variant="default">Agreement Signed</Badge>;
    }
    if (action.includes('created')) {
      return <Badge variant="secondary">Created</Badge>;
    }
    if (action.includes('updated')) {
      return <Badge variant="outline">Updated</Badge>;
    }
    return <Badge variant="outline">{action}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Third-Party Disclosures */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Third-Party Data Disclosures
          </CardTitle>
          <CardDescription>
            All instances where this student&apos;s data was shared with external parties (FERPA 34 CFR § 99.32)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {disclosures.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No third-party disclosures recorded</p>
              <p className="text-sm mt-2">This student&apos;s data has not been shared with external parties</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Disclosed To</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Data Fields</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {disclosures.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">
                      {formatDate(log.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                        {log.metadata.disclosed_to || 'Unknown'}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {log.metadata.purpose || 'No purpose specified'}
                      </p>
                    </TableCell>
                    <TableCell>
                      {log.metadata.data_fields && log.metadata.data_fields.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {log.metadata.data_fields.slice(0, 3).map((field, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {field}
                            </Badge>
                          ))}
                          {log.metadata.data_fields.length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                              +{log.metadata.data_fields.length - 3} more
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">Not specified</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {log.metadata.request_id ? (
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {log.metadata.request_id.substring(0, 8)}...
                        </code>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Recent Activity
          </CardTitle>
          <CardDescription>
            Other actions performed on this student&apos;s record
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No recent activity</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activity.slice(0, 10).map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">
                      {formatDate(log.created_at)}
                    </TableCell>
                    <TableCell>
                      {getActionBadge(log.action)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.metadata.competitor_name && (
                        <span>Student: {log.metadata.competitor_name}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* FERPA Notice */}
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertTitle>FERPA Compliance</AlertTitle>
        <AlertDescription>
          This disclosure log is maintained in accordance with FERPA 34 CFR § 99.32. Parents and eligible students
          have the right to inspect and review this log. All disclosures are tracked and retained for audit purposes.
        </AlertDescription>
      </Alert>
    </div>
  );
}
