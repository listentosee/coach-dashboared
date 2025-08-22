'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@supabase/supabase-js';

interface ActivityLog {
  id: string;
  action: string;
  entity_type?: string;
  entity_id?: string;
  metadata?: any;
  created_at: string;
}

export default function ActivityPage() {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchActivities();
  }, []);

  const fetchActivities = async () => {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch recent activity logs
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setActivities(data || []);
    } catch (error) {
      console.error('Error fetching activities:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'competitor_created':
        return '👤';
      case 'team_created':
        return '👥';
      case 'profile_updated':
        return '✏️';
      case 'login':
        return '🔑';
      default:
        return '📝';
    }
  };

  const getActionDescription = (action: string, metadata?: any) => {
    switch (action) {
      case 'competitor_created':
        return `Added new competitor: ${metadata?.competitor_name || 'Unknown'}`;
      case 'team_created':
        return `Created new team: ${metadata?.team_name || 'Unknown'}`;
      case 'profile_updated':
        return 'Updated competitor profile';
      case 'login':
        return 'Signed in to dashboard';
      default:
        return action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-4">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Activity Log</h1>
        <p className="text-gray-600 mt-2">
          Track recent activity and changes in your program
        </p>
      </div>

      {/* Activity Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Activities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activities.length}</div>
            <p className="text-xs text-muted-foreground">
              Actions recorded
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {activities.filter(activity => {
                const today = new Date();
                const activityDate = new Date(activity.created_at);
                return activityDate.toDateString() === today.toDateString();
              }).length}
            </div>
            <p className="text-xs text-muted-foreground">
              Activities today
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Week</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {activities.filter(activity => {
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                const activityDate = new Date(activity.created_at);
                return activityDate >= weekAgo;
              }).length}
            </div>
            <p className="text-xs text-muted-foreground">
              Activities this week
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Activity List */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>
            {activities.length === 0 
              ? 'No activity recorded yet. Start using the dashboard to see activity here!'
              : 'Latest actions and changes in your program'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activities.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No activity recorded yet.
            </div>
          ) : (
            <div className="space-y-4">
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50"
                >
                  <div className="text-2xl">
                    {getActionIcon(activity.action)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {getActionDescription(activity.action, activity.metadata)}
                    </p>
                    <div className="flex items-center space-x-2 text-xs text-gray-500 mt-1">
                      <span>
                        {new Date(activity.created_at).toLocaleString()}
                      </span>
                      {activity.entity_type && (
                        <>
                          <span>•</span>
                          <span className="capitalize">{activity.entity_type}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity Types Info */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Types</CardTitle>
          <CardDescription>
            Understanding the different types of activities recorded
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <h4 className="font-medium text-gray-900">User Actions</h4>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-center space-x-2">
                  <span>🔑</span>
                  <span>Login/Logout</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span>✏️</span>
                  <span>Profile Updates</span>
                </div>
              </div>
            </div>
            
            <div className="space-y-3">
              <h4 className="font-medium text-gray-900">Program Management</h4>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-center space-x-2">
                  <span>👤</span>
                  <span>Competitor Management</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span>👥</span>
                  <span>Team Management</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
