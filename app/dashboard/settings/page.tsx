'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase/client';
import { User, Lock, MessageSquare } from 'lucide-react';
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


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-meta-light">Coach Tools</h1>
        <p className="text-meta-muted mt-1">
          Manage your profile, account settings, and preferences
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left Column — Profile */}
        <Card className="bg-meta-card border-meta-border">
          <CardHeader className="pb-4">
            <CardTitle className="text-meta-light flex items-center text-lg">
              <User className="h-5 w-5 mr-2" />
              Profile Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="first_name" className="text-meta-light text-xs">First Name</Label>
                <Input
                  id="first_name"
                  value={profileForm.first_name}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, first_name: e.target.value }))}
                  className="bg-meta-card border-meta-border text-meta-light h-9"
                />
              </div>
              <div>
                <Label htmlFor="last_name" className="text-meta-light text-xs">Last Name</Label>
                <Input
                  id="last_name"
                  value={profileForm.last_name}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, last_name: e.target.value }))}
                  className="bg-meta-card border-meta-border text-meta-light h-9"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="school_name" className="text-meta-light text-xs">School Name</Label>
              <Input
                id="school_name"
                value={profileForm.school_name}
                disabled
                className="bg-slate-900/70 border-meta-border text-meta-light disabled:opacity-100 h-9"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="mobile_number" className="text-meta-light text-xs">Mobile Number</Label>
                <Input
                  id="mobile_number"
                  value={profileForm.mobile_number}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, mobile_number: e.target.value }))}
                  className="bg-meta-card border-meta-border text-meta-light h-9"
                />
              </div>
              <div>
                <Label htmlFor="region" className="text-meta-light text-xs">Region</Label>
                <Input
                  id="region"
                  value={profileForm.region}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, region: e.target.value }))}
                  className="bg-meta-card border-meta-border text-meta-light h-9"
                />
              </div>
            </div>
            <div>
              <Label className="text-meta-light text-xs">Email</Label>
              <Input
                value={profile?.email || ''}
                disabled
                className="bg-slate-900/70 border-meta-border text-meta-light disabled:opacity-100 h-9"
              />
            </div>
            <div className="flex items-center gap-4 pt-1">
              <div className="flex items-center gap-1.5">
                <input type="checkbox" checked={profile?.is_approved || false} disabled className="rounded border-slate-600 bg-slate-800 text-blue-500 h-3.5 w-3.5" />
                <Label className="text-meta-muted text-xs">Approved</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <input type="checkbox" checked={profile?.live_scan_completed || false} disabled className="rounded border-slate-600 bg-slate-800 text-blue-500 h-3.5 w-3.5" />
                <Label className="text-meta-muted text-xs">Live Scan</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <input type="checkbox" checked={profile?.mandated_reporter_completed || false} disabled className="rounded border-slate-600 bg-slate-800 text-blue-500 h-3.5 w-3.5" />
                <Label className="text-meta-muted text-xs">Mandated Reporter</Label>
              </div>
            </div>
            <Button
              onClick={handleUpdateProfile}
              className="bg-blue-600 hover:bg-blue-700 text-white w-full"
              disabled={isUpdatingProfile}
            >
              {isUpdatingProfile ? 'Updating...' : 'Update Profile'}
            </Button>
          </CardContent>
        </Card>

        {/* Right Column — Account & Preferences */}
        <div className="space-y-6">
          {/* Password Change */}
          <Card className="bg-meta-card border-meta-border">
            <CardHeader className="pb-4">
              <CardTitle className="text-meta-light flex items-center text-lg">
                <Lock className="h-5 w-5 mr-2" />
                {assisted ? 'Set New Password' : 'Change Password'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!assisted && (
                <div>
                  <Label htmlFor="current_password" className="text-meta-light text-xs">Current Password</Label>
                  <Input
                    id="current_password"
                    type="password"
                    value={passwordForm.current_password}
                    onChange={(e) => setPasswordForm(prev => ({ ...prev, current_password: e.target.value }))}
                    className="bg-meta-card border-meta-border text-meta-light h-9"
                  />
                </div>
              )}
              <div>
                <Label htmlFor="new_password" className="text-meta-light text-xs">New Password <span className="text-meta-muted">(min 6 characters)</span></Label>
                <Input
                  id="new_password"
                  type="password"
                  value={passwordForm.new_password}
                  onChange={(e) => setPasswordForm(prev => ({ ...prev, new_password: e.target.value }))}
                  className="bg-meta-card border-meta-border text-meta-light h-9"
                />
              </div>
              <div>
                <Label htmlFor="confirm_password" className="text-meta-light text-xs">Confirm New Password</Label>
                <Input
                  id="confirm_password"
                  type="password"
                  value={passwordForm.confirm_password}
                  onChange={(e) => setPasswordForm(prev => ({ ...prev, confirm_password: e.target.value }))}
                  className="bg-meta-card border-meta-border text-meta-light h-9"
                />
              </div>
              <Button
                onClick={handleChangePassword}
                className="bg-blue-600 hover:bg-blue-700 text-white w-full"
                disabled={isChangingPassword}
              >
                {isChangingPassword ? 'Changing...' : assisted ? 'Set Password' : 'Change Password'}
              </Button>
            </CardContent>
          </Card>

          {/* Alert Preferences */}
          <Card className="bg-meta-card border-meta-border">
            <CardHeader className="pb-4">
              <CardTitle className="text-meta-light flex items-center text-lg">
                <MessageSquare className="h-5 w-5 mr-2" />
                Alert Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="email-alerts-enabled" className="text-meta-light text-sm font-medium">Daily Email Alerts</Label>
                  <p className="text-xs text-meta-muted">Reminder for unread messages</p>
                </div>
                <Switch
                  id="email-alerts-enabled"
                  checked={emailAlertsEnabled}
                  onCheckedChange={handleToggleEmailAlerts}
                  disabled={isUpdatingEmailAlerts}
                />
              </div>
              <div>
                <Label htmlFor="alert-email" className="text-meta-light text-xs">Alert Email Address</Label>
                <Input
                  id="alert-email"
                  type="email"
                  value={alertEmail}
                  onChange={(e) => setAlertEmail(e.target.value)}
                  onBlur={() => void handleSaveEmailAlertSettings()}
                  placeholder={profile?.email || 'coach@example.edu'}
                  className="bg-meta-card border-meta-border text-meta-light h-9"
                  disabled={isUpdatingEmailAlerts}
                />
                <p className="text-xs text-meta-muted mt-1">
                  Sends to <span className="text-meta-light font-medium">{alertEmail.trim() || profile?.email || 'your account email'}</span>. Leave blank for account email.
                </p>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
