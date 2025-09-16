'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function CompetitionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-meta-light">Game Platform</h1>
        <p className="text-meta-muted mt-2">
          Manage platform registrations and status
        </p>
      </div>

      <Card className="bg-meta-card border-meta-border">
        <CardHeader>
          <CardTitle className="text-meta-light">Game Platform Management</CardTitle>
          <CardDescription className="text-meta-muted">
            Register teams and synchronize with the game platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-meta-muted">Game platform features coming soon...</p>
        </CardContent>
      </Card>
    </div>
  );
}
