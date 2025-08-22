'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function CompetitionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-meta-light">Competitions</h1>
        <p className="text-meta-muted mt-2">
          Manage competition registrations and results
        </p>
      </div>

      <Card className="bg-meta-card border-meta-border">
        <CardHeader>
          <CardTitle className="text-meta-light">Competition Management</CardTitle>
          <CardDescription className="text-meta-muted">
            Register teams and track competition performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-meta-muted">Competition features coming soon...</p>
        </CardContent>
      </Card>
    </div>
  );
}
