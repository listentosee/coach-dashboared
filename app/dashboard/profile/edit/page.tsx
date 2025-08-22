'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MondayClient } from '@/lib/integrations/monday';

interface CoachProfile {
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  schoolName: string;
  mobileNumber?: string;
  division?: string;
  region?: string;
}

export default function ProfileEditPage() {
  const [profile, setProfile] = useState<CoachProfile | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email');

  useEffect(() => {
    if (email) {
      loadCoachProfile(email);
    }
  }, [email]);

  const loadCoachProfile = async (email: string) => {
    try {
      const mondayClient = new MondayClient();
      const coach = await mondayClient.getCoachByEmail(email);
      
      if (coach && coach.isApproved) {
        setProfile({
          email: coach.email,
          fullName: coach.fullName,
          firstName: coach.firstName,
          lastName: coach.lastName,
          schoolName: coach.schoolName,
          mobileNumber: coach.mobileNumber,
          division: coach.division,
          region: coach.region
        });
      } else {
        setError('Coach not found or not approved');
      }
    } catch (error: any) {
      setError('Error loading coach profile: ' + error.message);
    }
  };

  const handlePasswordReset = async () => {
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
      // Create the coach account first
      const createResponse = await fetch('/api/auth/create-coach', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          email: email!,
          password,
          profile: profile
        })
      });

      const createResult = await createResponse.json();
      
      if (createResult.error) {
        setError('Error creating account: ' + createResult.error);
        return;
      }

      // Now sign in the coach to create a session
      const signInResponse = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          email: email!,
          password
        })
      });

      const signInResult = await signInResponse.json();
      
      if (signInResult.error) {
        setError('Error signing in: ' + signInResult.error);
        return;
      }

      setSuccess('Account created and signed in! Redirecting to dashboard...');
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);
      
    } catch (error: any) {
      setError('Error: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          {error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          ) : (
            <div>Loading profile...</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Coach Profile</h1>
          <p className="mt-2 text-gray-600">Review your information and set your password</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>Your information from Monday.com</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email</Label>
                <Input value={profile.email} disabled />
              </div>
              <div>
                <Label>Full Name</Label>
                <Input value={profile.fullName} disabled />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>First Name</Label>
                <Input value={profile.firstName} disabled />
              </div>
              <div>
                <Label>Last Name</Label>
                <Input value={profile.lastName} disabled />
              </div>
            </div>
            
            <div>
              <Label>School Name</Label>
              <Input value={profile.schoolName} disabled />
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Mobile Number</Label>
                <Input value={profile.mobileNumber || ''} disabled />
              </div>
              <div>
                <Label>Division</Label>
                <Input value={profile.division || ''} disabled />
              </div>
              <div>
                <Label>Region</Label>
                <Input value={profile.region || ''} disabled />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Set Password</CardTitle>
            <CardDescription>Create your account password</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}
            
            {success && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
                {success}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
              />
            </div>
            
            <Button
              onClick={handlePasswordReset}
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? 'Setting Password...' : 'Set Password & Create Account'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
