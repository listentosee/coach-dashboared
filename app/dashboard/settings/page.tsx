'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase/client';
import { User, Lock, Database, MessageSquare } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

interface Profile {
  id: string;
  email: string;
  role: string;
  full_name: string;
  first_name: string;
  last_name: string;
  school_name: string;
  mobile_number: string | null;
  division: string | null;
  region: string | null;
  monday_coach_id: string | null;
  is_approved: boolean;
  live_scan_completed: boolean;
  mandated_reporter_completed: boolean;
  created_at: string;
  updated_at: string;
  sms_notifications_enabled: boolean;
  instant_sms_enabled: boolean;
  email_alerts_enabled: boolean;
  email_alert_address: string | null;
}

export default function CoachToolsPage() {
  const router = useRouter();
  // Build-only safe default; assisted reset flow will be reintroduced
  // via a server-set cookie in a later step
  const assisted = false;
  const [isUpdatingStatuses, setIsUpdatingStatuses] = useState(false);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileForm, setProfileForm] = useState({
    first_name: '',
    last_name: '',
    school_name: '',
    mobile_number: '',
    region: '',
  });
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [emailAlertsEnabled, setEmailAlertsEnabled] = useState(true);
  const [alertEmail, setAlertEmail] = useState('');
  const [isUpdatingEmailAlerts, setIsUpdatingEmailAlerts] = useState(false);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const fetchProfile = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileData) {
        setProfile(profileData);
        setProfileForm({
          first_name: profileData.first_name || '',
          last_name: profileData.last_name || '',
          school_name: profileData.school_name || '',
          mobile_number: profileData.mobile_number || '',
          region: profileData.region || '',
        });
        setEmailAlertsEnabled(profileData.email_alerts_enabled ?? true);
        setAlertEmail(profileData.email_alert_address || '');
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleUpdateProfile = async () => {
    try {
      setIsUpdatingProfile(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: profileForm.first_name,
          last_name: profileForm.last_name,
          // school_name is sourced from Monday sync; keep read-only in UI
          mobile_number: profileForm.mobile_number || null,
          region: profileForm.region || null,
        })
        .eq('id', user.id);

      if (error) throw error;

      alert('Profile updated successfully!');
      fetchProfile();
    } catch (error: any) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile: ' + error.message);
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const persistEmailAlertSettings = async (enabled: boolean, emailValue: string) => {
    setIsUpdatingEmailAlerts(true);

    try {
      const trimmedEmail = (emailValue || '').trim();
      if (trimmedEmail && !emailRegex.test(trimmedEmail)) {
        throw new Error('Please enter a valid email address or leave the field blank to use your account email.');
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('profiles')
        .update({
          email_alerts_enabled: enabled,
          email_alert_address: trimmedEmail || null,
        })
        .eq('id', user.id);

      if (error) throw error;
    } finally {
      setIsUpdatingEmailAlerts(false);
    }
  };

  const handleToggleEmailAlerts = async (enabled: boolean) => {
    const previous = emailAlertsEnabled;
    setEmailAlertsEnabled(enabled);

    try {
      await persistEmailAlertSettings(enabled, alertEmail);
      alert(`Email alerts ${enabled ? 'enabled' : 'disabled'} successfully!`);
      fetchProfile();
    } catch (error: any) {
      console.error('Error updating email alerts:', error);
      setEmailAlertsEnabled(previous);
      alert('Failed to update email alerts: ' + error.message);
    }
  };

  const handleSaveEmailAlertSettings = async () => {
    try {
      await persistEmailAlertSettings(emailAlertsEnabled, alertEmail);
      alert('Email alert settings updated successfully!');
      fetchProfile();
    } catch (error: any) {
      console.error('Error saving email alert settings:', error);
      alert('Failed to update email alert settings: ' + error.message);
    }
  };

  const handleChangePassword = async () => {
    try {
      if (!assisted && !passwordForm.current_password) {
        alert('Current password is required');
        return;
      }

      if (passwordForm.new_password !== passwordForm.confirm_password) {
        alert('New passwords do not match');
        return;
      }

      if (passwordForm.new_password.length < 6) {
        alert('New password must be at least 6 characters long');
        return;
      }

      setIsChangingPassword(true);

      // First verify the current password by attempting to sign in
      if (!assisted) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: profile?.email || '',
          password: passwordForm.current_password,
        });
        if (signInError) {
          throw new Error('Current password is incorrect');
        }
      }

      // Update the password (assisted sessions can set directly)
      const { error } = await supabase.auth.updateUser({
        password: passwordForm.new_password
      });

      if (error) throw error;

      alert('Password changed successfully!');
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });

      // Clean assisted flag from URL after success
      if (assisted) {
        router.replace('/dashboard/settings');
      }
    } catch (error: any) {
      console.error('Error changing password:', error);
      alert('Failed to change password: ' + error.message);
    } finally {
      setIsChangingPassword(false);
    }
  };

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
        <h1 className="text-3xl font-bold text-meta-light">Coach Tools</h1>
        <p className="text-meta-muted mt-2">
          Manage your profile, account settings, and data maintenance
        </p>
      </div>

      {/* Profile Editor */}
      <Card className="bg-meta-card border-meta-border">
        <CardHeader>
          <CardTitle className="text-meta-light flex items-center">
            <User className="h-5 w-5 mr-2" />
            Profile Editor
          </CardTitle>
          <CardDescription className="text-meta-muted">
            Update your personal information and contact details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="first_name" className="text-meta-light">First Name</Label>
              <Input
                id="first_name"
                value={profileForm.first_name}
                onChange={(e) => setProfileForm(prev => ({ ...prev, first_name: e.target.value }))}
                className="bg-meta-card border-meta-border text-meta-light"
                placeholder="Enter your first name"
              />
            </div>
            <div>
              <Label htmlFor="last_name" className="text-meta-light">Last Name</Label>
              <Input
                id="last_name"
                value={profileForm.last_name}
                onChange={(e) => setProfileForm(prev => ({ ...prev, last_name: e.target.value }))}
                className="bg-meta-card border-meta-border text-meta-light"
                placeholder="Enter your last name"
              />
            </div>
          </div>
          <div>
          <Label htmlFor="school_name" className="text-meta-light">School Name</Label>
          <Input
            id="school_name"
            value={profileForm.school_name}
            disabled
            className="bg-meta-dark border-meta-border text-meta-light disabled:bg-meta-dark/70 disabled:text-meta-light disabled:opacity-100"
            placeholder="School name (managed by Monday integration)"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="mobile_number" className="text-meta-light">Mobile Number</Label>
            <Input
              id="mobile_number"
              value={profileForm.mobile_number}
              onChange={(e) => setProfileForm(prev => ({ ...prev, mobile_number: e.target.value }))}
              className="bg-meta-card border-meta-border text-meta-light"
              placeholder="Enter your mobile number"
            />
          </div>
        </div>
          <div>
            <Label htmlFor="region" className="text-meta-light">Region</Label>
            <Input
              id="region"
              value={profileForm.region}
              onChange={(e) => setProfileForm(prev => ({ ...prev, region: e.target.value }))}
              className="bg-meta-card border-meta-border text-meta-light"
              placeholder="Enter your region"
            />
          </div>
          <div>
            <Label className="text-meta-light">Email</Label>
            <Input
              value={profile?.email || ''}
              disabled
              className="bg-meta-dark border-meta-border text-meta-light disabled:bg-meta-dark/70 disabled:text-meta-light disabled:opacity-100"
              placeholder="Email (cannot be changed)"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={profile?.is_approved || false}
                disabled
                className="rounded border-meta-border bg-meta-card text-meta-accent focus:ring-meta-accent"
              />
              <Label className="text-meta-light">Approved</Label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={profile?.live_scan_completed || false}
                disabled
                className="rounded border-meta-border bg-meta-card text-meta-accent focus:ring-meta-accent"
              />
              <Label className="text-meta-light">Live Scan Completed</Label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={profile?.mandated_reporter_completed || false}
                disabled
                className="rounded border-meta-border bg-meta-card text-meta-accent focus:ring-meta-accent"
              />
              <Label className="text-meta-light">Mandated Reporter Completed</Label>
            </div>
          </div>
          <Button 
            onClick={handleUpdateProfile}
            className="bg-meta-accent hover:bg-blue-600 text-white"
            disabled={isUpdatingProfile}
          >
            {isUpdatingProfile ? 'Updating...' : 'Update Profile'}
          </Button>
        </CardContent>
      </Card>

      {/* Password Change */}
      <Card className="bg-meta-card border-meta-border">
        <CardHeader>
          <CardTitle className="text-meta-light flex items-center">
            <Lock className="h-5 w-5 mr-2" />
            {assisted ? 'Set New Password (Assisted)' : 'Change Password'}
          </CardTitle>
          <CardDescription className="text-meta-muted">
            {assisted
              ? 'You are signed in via an assisted access link. Set a new password below to regain access.'
              : 'Update your account password for enhanced security'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!assisted && (
            <div>
              <Label htmlFor="current_password" className="text-meta-light">Current Password</Label>
              <Input
                id="current_password"
                type="password"
                value={passwordForm.current_password}
                onChange={(e) => setPasswordForm(prev => ({ ...prev, current_password: e.target.value }))}
                className="bg-meta-card border-meta-border text-meta-light"
                placeholder="Enter your current password"
              />
            </div>
          )}
          <div>
            <Label htmlFor="new_password" className="text-meta-light">New Password</Label>
            <Input
              id="new_password"
              type="password"
              value={passwordForm.new_password}
              onChange={(e) => setPasswordForm(prev => ({ ...prev, new_password: e.target.value }))}
              className="bg-meta-card border-meta-border text-meta-light"
              placeholder="Enter new password (min 6 characters)"
            />
          </div>
          <div>
            <Label htmlFor="confirm_password" className="text-meta-light">Confirm New Password</Label>
            <Input
              id="confirm_password"
              type="password"
              value={passwordForm.confirm_password}
              onChange={(e) => setPasswordForm(prev => ({ ...prev, confirm_password: e.target.value }))}
              className="bg-meta-card border-meta-border text-meta-light"
              placeholder="Confirm new password"
            />
          </div>
          <Button 
            onClick={handleChangePassword}
            className="bg-meta-accent hover:bg-blue-600 text-white"
            disabled={isChangingPassword}
          >
            {isChangingPassword ? 'Changing...' : assisted ? 'Set Password' : 'Change Password'}
          </Button>
        </CardContent>
      </Card>

      {/* Alert Notification Settings */}
      <Card className="bg-meta-card border-meta-border">
        <CardHeader>
          <CardTitle className="text-meta-light flex items-center">
            <MessageSquare className="h-5 w-5 mr-2" />
            Alert Notifications
          </CardTitle>
          <CardDescription className="text-meta-muted">
            Choose how you want to be reminded when you have unread messages.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-md border border-meta-border p-4 space-y-4 bg-meta-panel">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="email-alerts-enabled" className="text-meta-light font-medium">
                  Enable Daily Email Alerts
                </Label>
                <p className="text-sm text-meta-muted">
                  Receive an email reminder when you have unread messages in your inbox.
                </p>
              </div>
              <Switch
                id="email-alerts-enabled"
                checked={emailAlertsEnabled}
                onCheckedChange={handleToggleEmailAlerts}
                disabled={isUpdatingEmailAlerts}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="alert-email" className="text-meta-light">Alert Email Address</Label>
              <Input
                id="alert-email"
                type="email"
                value={alertEmail}
                onChange={(e) => setAlertEmail(e.target.value)}
                placeholder={profile?.email || 'coach@example.edu'}
                className="bg-meta-card border-meta-border text-meta-light"
                disabled={isUpdatingEmailAlerts}
              />
              <p className="text-sm text-meta-muted">
                We will send alerts to <span className="text-meta-light font-semibold">{alertEmail.trim() || profile?.email || 'your account email'}</span>. Leave the field blank to use your account email.
              </p>
              <div className="flex justify-end">
                <Button
                  onClick={handleSaveEmailAlertSettings}
                  className="bg-meta-accent hover:bg-blue-600 text-white"
                  disabled={isUpdatingEmailAlerts}
                >
                  {isUpdatingEmailAlerts ? 'Saving...' : 'Save Email Alert Settings'}
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-meta-border p-4 space-y-2 bg-meta-panel">
            <Label className="text-meta-light font-medium">
              SMS Alerts (Future Feature)
            </Label>
            <p className="text-sm text-meta-muted">
              We&apos;re focused on stabilizing the new message alert system, so SMS reminders are temporarily disabled.
              Please use email alerts for now—SMS notifications will return in a future release.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Data Maintenance */}
      <Card className="bg-meta-card border-meta-border">
        <CardHeader>
          <CardTitle className="text-meta-light flex items-center">
            <Database className="h-5 w-5 mr-2" />
            Data Maintenance
          </CardTitle>
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
