'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function SettingsPage() {
  const [isUpdatingStatuses, setIsUpdatingStatuses] = useState(false);

  const handleUpdateAllStatuses = async () => {
    try {
      setIsUpdatingStatuses(true);
      
      const response = await fetch('/api/competitors/maintenance/update-statuses', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to update statuses');
      }

      const result = await response.json();
      console.log('Status update result:', result);
      
      if (result.result.errors > 0) {
        const errorDetails = result.result.errorDetails?.map((err: any) => 
          `${err.competitor}: ${err.error}`
        ).join('\n');
        
        alert(`Status update completed: ${result.result.updated} updated, ${result.result.errors} errors\n\nError details:\n${errorDetails}`);
      } else {
        alert(`Status update completed: ${result.result.updated} updated successfully`);
      }
    } catch (error: any) {
      console.error('Error updating statuses:', error);
      alert('Failed to update competitor statuses: ' + error.message);
    } finally {
      setIsUpdatingStatuses(false);
    }
  };

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

      <Card className="bg-meta-card border-meta-border">
        <CardHeader>
          <CardTitle className="text-meta-light">Data Maintenance</CardTitle>
          <CardDescription className="text-meta-muted">
            Administrative functions for data management
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={handleUpdateAllStatuses}
            className="bg-meta-accent hover:bg-blue-600 text-white"
            disabled={isUpdatingStatuses}
          >
            {isUpdatingStatuses ? 'Updating...' : 'Update All Competitor Statuses'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
