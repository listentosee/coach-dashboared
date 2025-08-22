'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { X } from 'lucide-react';

const profileUpdateSchema = z.object({
  first_name: z.string().min(2, 'First name must be at least 2 characters'),
  last_name: z.string().min(2, 'Last name must be at least 2 characters'),
  grade: z.string().min(1, 'Grade is required'),
  gender: z.string().min(1, 'Gender is required'),
  race: z.string().min(1, 'Race is required'),
  ethnicity: z.string().min(1, 'Ethnicity is required'),
  years_competing: z.number().min(0).max(20).optional(),
  level_of_technology: z.string().min(1, 'Level of technology is required'),
  parent_name: z.string().min(1, 'Parent/Guardian name is required'),
  parent_email: z.string().email('Valid email is required'),
  competition_type: z.enum(['trove', 'gymnasium', 'mayors_cup']),
});

interface CompetitorProfile {
  id: string;
  first_name: string;
  last_name: string;
  grade?: string;
  gender?: string;
  race?: string;
  ethnicity?: string;
  years_competing?: string;
  level_of_technology?: string;
  parent_name?: string;
  parent_email?: string;
  profile_update_token: string;
  profile_update_token_expires: string;
}

export default function UpdateProfilePage() {
  const params = useParams();
  const router = useRouter();
  const [profile, setProfile] = useState<CompetitorProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [regeneratedLink, setRegeneratedLink] = useState<string | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);

  const form = useForm<z.infer<typeof profileUpdateSchema>>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      grade: '',
      gender: '',
      race: '',
      ethnicity: '',
      years_competing: undefined,
      level_of_technology: '',
      parent_name: '',
      parent_email: '',
      competition_type: 'mayors_cup',
    },
  });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await fetch(`/api/competitors/profile/${params.token}`);
        if (!response.ok) {
          throw new Error('Profile not found or token expired');
        }
        
        const data = await response.json();
        setProfile(data.profile);
        
        // Pre-fill form with existing data
        form.reset({
          first_name: data.profile.first_name || '',
          last_name: data.profile.last_name || '',
          grade: data.profile.grade || '',
          gender: data.profile.gender || '',
          race: data.profile.race || '',
          ethnicity: data.profile.ethnicity || '',
          years_competing: data.profile.years_competing ? parseInt(data.profile.years_competing.toString(), 10) : undefined,
          level_of_technology: data.profile.level_of_technology || '',
          parent_name: data.profile.parent_name || '',
          parent_email: data.profile.parent_email || '',
          competition_type: 'mayors_cup',
        });
      } catch (error: any) {
        setError(error.message);
      } finally {
        setIsLoading(false);
      }
    };

    if (params.token) {
      fetchProfile();
    }
  }, [params.token, form]);

  const onSubmit = async (values: z.infer<typeof profileUpdateSchema>) => {
    try {
      const response = await fetch(`/api/competitors/profile/${params.token}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error('Failed to update profile');
      }

      setSuccess(true);
    } catch (error: any) {
      setError(error.message);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-green-600">Profile Updated!</CardTitle>
            <CardDescription>
              Your profile has been successfully updated. You can now close this page.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-meta-dark py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-meta-light">
            {profile?.first_name?.toUpperCase()} {profile?.last_name?.toUpperCase()} UPDATE FORM
          </h1>
          <p className="text-meta-muted mt-2">*Bookmark this URL for easy access</p>
        </div>

        <Card className="bg-meta-card border-meta-border">
          <CardContent className="p-8">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              {/* Personal Information */}
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-meta-light">Personal Information</h2>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="grade" className="text-meta-light">Grade *</Label>
                    <Select onValueChange={(value) => form.setValue('grade', value)} value={form.watch('grade')}>
                      <SelectTrigger className="bg-meta-dark border-meta-border text-meta-light">
                        <SelectValue placeholder="Select grade" />
                      </SelectTrigger>
                      <SelectContent className="bg-meta-card border-meta-border">
                        <SelectItem value="9">9th Grade</SelectItem>
                        <SelectItem value="10">10th Grade</SelectItem>
                        <SelectItem value="11">11th Grade</SelectItem>
                        <SelectItem value="12">12th Grade</SelectItem>
                        <SelectItem value="college">College</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="gender" className="text-meta-light">Gender *</Label>
                    <Select onValueChange={(value) => form.setValue('gender', value)} value={form.watch('gender')}>
                      <SelectTrigger className="bg-meta-dark border-meta-border text-meta-light">
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                      <SelectContent className="bg-meta-card border-meta-border">
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                        <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="race" className="text-meta-light">Race *</Label>
                    <Select onValueChange={(value) => form.setValue('race', value)} value={form.watch('race')}>
                      <SelectTrigger className="bg-meta-dark border-meta-border text-meta-light">
                        <SelectValue placeholder="Select race" />
                      </SelectTrigger>
                      <SelectContent className="bg-meta-card border-meta-border">
                        <SelectItem value="white">White</SelectItem>
                        <SelectItem value="black">Black or African American</SelectItem>
                        <SelectItem value="hispanic">Hispanic or Latino</SelectItem>
                        <SelectItem value="asian">Asian</SelectItem>
                        <SelectItem value="native">Native American</SelectItem>
                        <SelectItem value="pacific">Pacific Islander</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="ethnicity" className="text-meta-light">Ethnicity *</Label>
                    <Select onValueChange={(value) => form.setValue('ethnicity', value)} value={form.watch('ethnicity')}>
                      <SelectTrigger className="bg-meta-dark border-meta-border text-meta-light">
                        <SelectValue placeholder="Select ethnicity" />
                      </SelectTrigger>
                      <SelectContent className="bg-meta-card border-meta-border">
                        <SelectItem value="not_hispanic">Not Hispanic or Latino</SelectItem>
                        <SelectItem value="hispanic">Hispanic or Latino</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="years_competing" className="text-meta-light">Years Competing</Label>
                    <Input 
                      {...form.register('years_competing', { 
                        setValueAs: (value) => value === '' ? undefined : parseInt(value, 10) || 0
                      })}
                      type="number" 
                      min="0"
                      max="20"
                      placeholder="0" 
                      className="bg-meta-dark border-meta-border text-meta-light placeholder:text-meta-muted"
                    />
                  </div>

                  <div>
                    <Label htmlFor="level_of_technology" className="text-meta-light">Level of Technology *</Label>
                    <Select onValueChange={(value) => form.setValue('level_of_technology', value)} value={form.watch('level_of_technology')}>
                      <SelectTrigger className="bg-meta-dark border-meta-border text-meta-light">
                        <SelectValue placeholder="Select level" />
                      </SelectTrigger>
                      <SelectContent className="bg-meta-card border-meta-border">
                        <SelectItem value="beginner">Beginner</SelectItem>
                        <SelectItem value="intermediate">Intermediate</SelectItem>
                        <SelectItem value="advanced">Advanced</SelectItem>
                        <SelectItem value="expert">Expert</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Participant Agreement */}
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-meta-light">Participant Agreement</h2>
                <div className="flex items-center space-x-2">
                  <span className="text-meta-light">Participant Agreemen...</span>
                  <X className="h-4 w-4 text-meta-muted" />
                </div>
                <p className="text-sm text-red-400">
                  You must sign the above agreement to obtain a game code. Note: It may take an hour or two for the system to reflect completion of your signed agreement.
                </p>
              </div>

              {/* Parent/Guardian Information */}
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-meta-light">Parent/Guardian Information</h2>
                
                <div>
                  <Label htmlFor="parent_name" className="text-meta-light">Parent/Guardian Name *</Label>
                  <Input 
                    {...form.register('parent_name')}
                    placeholder="Enter parent or guardian name" 
                    className="bg-meta-dark border-meta-border text-meta-light placeholder:text-meta-muted"
                  />
                  <p className="text-sm text-meta-muted mt-1">
                    A parent or guardian name and email is required. This is a legal parent or guardian over 18 years of age who is legally qualified to sign a liability release form for your participation.
                  </p>
                </div>

                <div>
                  <Label htmlFor="parent_email" className="text-meta-light">Parent/Guardian Email *</Label>
                  <Input 
                    {...form.register('parent_email')}
                    type="email" 
                    placeholder="Enter parent or guardian email" 
                    className="bg-meta-dark border-meta-border text-meta-light placeholder:text-meta-muted"
                  />
                </div>
              </div>

              {/* Game Resources */}
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-meta-light">GAME RESOURCES</h2>
                <div className="flex space-x-4">
                  <Button type="button" variant="outline" className="border-meta-border text-meta-light hover:bg-meta-accent hover:text-white">
                    Survey URL
                    <X className="h-4 w-4 ml-2" />
                  </Button>
                  <Button type="button" variant="outline" className="border-meta-border text-meta-light hover:bg-meta-accent hover:text-white">
                    Certificate URL
                    <X className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>

              {/* Competition Type */}
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-meta-light">Prepare for the competition</h2>
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <h3 className="font-medium mb-2 text-meta-light">Mayors Cup Main Event:</h3>
                    <p className="text-sm text-meta-muted">
                      The main competition for the Mayor's Cup. Work with your friends to compete for the top of the leaderboard.
                    </p>
                  </div>
                  
                  <div>
                    <Label className="text-meta-light">Select Competition Type</Label>
                    <RadioGroup 
                      onValueChange={(value) => form.setValue('competition_type', value as any)} 
                      value={form.watch('competition_type')}
                      className="mt-2"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="trove" id="trove" />
                          <Label htmlFor="trove" className="text-meta-light">Trove</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="gymnasium" id="gymnasium" />
                          <Label htmlFor="gymnasium" className="text-meta-light">Gymnasium</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="mayors_cup" id="mayors_cup" />
                          <Label htmlFor="mayors_cup" className="text-meta-light">Mayors Cup Main Event</Label>
                        </div>
                      </div>
                    </RadioGroup>
                  </div>
                </div>
              </div>

              {/* Topic Overview */}
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-meta-light">Topic Overview</h2>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <h3 className="font-medium text-meta-light">Open Source Intelligence</h3>
                    <p className="text-meta-muted">Gathering information from publicly available sources</p>
                  </div>
                  <div>
                    <h3 className="font-medium text-meta-light">Cryptography</h3>
                    <p className="text-meta-muted">Encryption, decryption, and secure communication</p>
                  </div>
                  <div>
                    <h3 className="font-medium text-meta-light">Linux</h3>
                    <p className="text-meta-muted">Command line operations and system administration</p>
                  </div>
                  <div>
                    <h3 className="font-medium text-meta-light">Log Analysis</h3>
                    <p className="text-meta-muted">Examining system logs for security insights</p>
                  </div>
                  <div>
                    <h3 className="font-medium text-meta-light">Network Traffic Analysis</h3>
                    <p className="text-meta-muted">Monitoring and analyzing network communications</p>
                  </div>
                </div>
              </div>

              {/* Submit and Cancel Buttons */}
              <div className="flex justify-center space-x-4">
                <Button type="button" variant="outline" size="lg" onClick={() => window.close()} className="border-meta-border text-meta-light hover:bg-meta-accent hover:text-white">
                  Cancel
                </Button>
                <Button type="submit" size="lg" className="bg-meta-accent hover:bg-blue-600">
                  Update Profile
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
