'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase/client'

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [coachProfile, setCoachProfile] = useState<any>(null);
  const router = useRouter();


  const verifyEmail = async () => {
    if (!email) {
      setError('Please enter an email address');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/monday/verify-coach', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email })
      });

      const result = await response.json();
      
      if (result.error) {
        setError(result.error);
        return;
      }
      
      if (result.exists && result.isApproved) {
        setEmailVerified(true);
        setCoachProfile(result.coach);
        setError('');
      } else if (result.exists && !result.isApproved) {
        setError('Coach found but not yet approved. Please contact your administrator.');
      } else {
        setError('Coach not found in Monday.com. Please verify your email or contact your administrator.');
      }
    } catch (error: any) {
      setError('Error verifying email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!emailVerified) {
      setError('Please verify your email address first');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Use Supabase auth signUp with profile data in metadata
      const { data, error } = await supabase.auth.signUp({
        email: email!,
        password,
        options: {
          data: {
            role: 'coach',
            monday_coach_id: coachProfile?.mondayId || '',
            name: coachProfile?.fullName || '',
            school_name: coachProfile?.schoolName || '',
            division: coachProfile?.division || '',
            region: coachProfile?.region || ''
          }
        }
      });

      if (error) throw error;

      if (data.user && data.session) {
        // We have both user and session, create profile with authenticated context
        const { error: profileError } = await supabase.from('profiles').insert({
          id: data.user.id,
          email: email!,
          full_name: coachProfile?.fullName || '',
          first_name: coachProfile?.firstName || '',
          last_name: coachProfile?.lastName || '',
          school_name: coachProfile?.schoolName || '',
          mobile_number: coachProfile?.mobileNumber || '',
          division: coachProfile?.division || '',
          region: coachProfile?.region || '',
          monday_coach_id: coachProfile?.mondayId || '',
          is_approved: true,
          live_scan_completed: false,
          mandated_reporter_completed: false
        });

        if (profileError) throw profileError;

        setSuccess('Account created and signed in! Redirecting to dashboard...');
        setTimeout(() => {
          router.push('/dashboard');
        }, 2000);
      } else if (data.user && !data.session) {
        // User created but no session - this means email confirmation is required
        setError('Account created but email confirmation required. Please check your email and confirm before signing in.');
      } else {
        throw new Error('Failed to create user account');
      }
      
    } catch (error: any) {
      console.error('Registration error:', error);
      setError('Registration failed: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-green-600">Registration Successful!</CardTitle>
            <CardDescription>
              Your account has been created and you are now signed in. Redirecting to dashboard...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-meta-dark flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-meta-light">
            Create your coach account
          </h2>
          <p className="mt-2 text-center text-sm text-meta-muted">
            Already have an account?{' '}
            <Link href="/auth/login" className="font-medium text-meta-accent hover:text-blue-400">
              Sign in here
            </Link>
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {/* Email Verification Step */}
          {!emailVerified ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="email" className="block text-sm font-medium text-meta-light mb-2">
                  Email address
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="appearance-none relative block w-full px-3 py-2 border border-meta-border placeholder-meta-muted text-meta-light bg-meta-card rounded-md focus:outline-none focus:ring-meta-accent focus:border-meta-accent focus:z-10 sm:text-sm"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              
              <Button
                type="button"
                onClick={verifyEmail}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-meta-accent hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-meta-accent"
                disabled={isLoading || !email}
              >
                {isLoading ? 'Verifying...' : 'Verify Email with Monday.com'}
              </Button>
            </div>
          ) : (
            /* Account Creation Step */
            <div className="space-y-4">
              <div className="bg-green-900/20 border border-green-600/50 rounded-md p-4">
                <p className="text-green-400 text-sm">
                  ✓ Email verified! Coach: {coachProfile?.name} from {coachProfile?.schoolName}
                </p>
              </div>
              
              <div>
                <Label htmlFor="password" className="block text-sm font-medium text-meta-light mb-2">
                  Password
                </Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="appearance-none relative block w-full px-3 py-2 border border-meta-border placeholder-meta-muted text-meta-light bg-meta-card rounded-md focus:outline-none focus:ring-meta-accent focus:border-meta-accent focus:z-10 sm:text-sm"
                  placeholder="Create a password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              
              <div>
                <Label htmlFor="confirmPassword" className="block text-sm font-medium text-meta-light mb-2">
                  Confirm Password
                </Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="appearance-none relative block w-full px-3 py-2 border border-meta-border placeholder-meta-muted text-meta-light bg-meta-card rounded-md focus:outline-none focus:ring-meta-accent focus:border-meta-accent focus:z-10 sm:text-sm"
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              
              <Button
                type="submit"
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-meta-accent hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-meta-accent"
                disabled={isLoading}
              >
                {isLoading ? 'Creating account...' : 'Create Account'}
              </Button>
            </div>
          )}

          {error && (
            <div className="text-red-400 text-sm text-center">{error}</div>
          )}
        </form>
      </div>
    </div>
  );
}
