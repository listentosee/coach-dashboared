'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-meta-light">Settings</h1>
        <p className="text-meta-muted mt-2">
          Manage your account and application preferences
        </p>
      </div>

      <Card className="bg-meta-card border-meta-border">
        <CardHeader>
          <CardTitle className="text-meta-light">Account Settings</CardTitle>
          <CardDescription className="text-meta-muted">
            Update your profile and account information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-meta-muted">Settings configuration coming soon...</p>
        </CardContent>
      </Card>
    </div>
  );
}
