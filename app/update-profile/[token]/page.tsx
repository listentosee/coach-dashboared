'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  is_18_or_over: z.boolean(),
  parent_name: z.string().optional(),
  parent_email: z.string().email('Valid email is required').optional(),
  competition_type: z.enum(['trove', 'gymnasium', 'mayors_cup']),
}).refine((data) => {
  if (!data.is_18_or_over) {
    return data.parent_name && data.parent_email;
  }
  return true;
}, {
  message: "Parent/Guardian information is required for participants under 18",
  path: ["parent_name"]
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
  is_18_or_over?: boolean;
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
      is_18_or_over: false,
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
          is_18_or_over: data.profile.is_18_or_over || false,
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
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                {/* Personal Information */}
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold text-meta-light">Personal Information</h2>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="grade"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-meta-light">Grade *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-meta-dark border-meta-border text-meta-light">
                                <SelectValue placeholder="Select grade" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-meta-card border-meta-border text-meta-light">
                              <SelectItem value="9">9th Grade</SelectItem>
                              <SelectItem value="10">10th Grade</SelectItem>
                              <SelectItem value="11">11th Grade</SelectItem>
                              <SelectItem value="12">12th Grade</SelectItem>
                              <SelectItem value="college">College</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="gender"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-meta-light">Gender *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-meta-dark border-meta-border text-meta-light">
                                <SelectValue placeholder="Select gender" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-meta-card border-meta-border text-meta-light">
                              <SelectItem value="male">Male</SelectItem>
                              <SelectItem value="female">Female</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                              <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="race"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-meta-light">Race *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-meta-dark border-meta-border text-meta-light">
                                <SelectValue placeholder="Select race" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-meta-card border-meta-border text-meta-light">
                              <SelectItem value="white">White</SelectItem>
                              <SelectItem value="black">Black or African American</SelectItem>
                              <SelectItem value="hispanic">Hispanic or Latino</SelectItem>
                              <SelectItem value="asian">Asian</SelectItem>
                              <SelectItem value="native">Native American</SelectItem>
                              <SelectItem value="pacific">Pacific Islander</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="ethnicity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-meta-light">Ethnicity *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-meta-dark border-meta-border text-meta-light">
                                <SelectValue placeholder="Select ethnicity" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-meta-card border-meta-border text-meta-light">
                              <SelectItem value="not_hispanic">Not Hispanic or Latino</SelectItem>
                              <SelectItem value="hispanic">Hispanic or Latino</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="years_competing"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-meta-light">Years Competing</FormLabel>
                          <FormControl>
                            <Input 
                              {...field}
                              onChange={(e) => field.onChange(e.target.value === '' ? undefined : parseInt(e.target.value, 10) || 0)}
                              type="number" 
                              min="0"
                              max="20"
                              placeholder="0" 
                              className="bg-meta-dark border-meta-border text-meta-light placeholder:text-meta-muted"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="level_of_technology"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-meta-light">Level of Technology *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-meta-dark border-meta-border text-meta-light">
                                <SelectValue placeholder="Select level" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-meta-card border-meta-border text-meta-light">
                              <SelectItem value="beginner">Beginner</SelectItem>
                              <SelectItem value="intermediate">Intermediate</SelectItem>
                              <SelectItem value="advanced">Advanced</SelectItem>
                              <SelectItem value="expert">Expert</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* 18+ Status */}
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold text-meta-light">Age Verification</h2>
                  
                  <FormField
                    control={form.control}
                    name="is_18_or_over"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border border-meta-border p-4 bg-meta-card">
                        <div className="space-y-0.5">
                          <FormLabel className="text-meta-light">18 or Over</FormLabel>
                          <FormDescription className="text-meta-muted">
                            Are you 18 years of age or older?
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                {/* Participant Agreement */}
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold text-meta-light">Participant Agreement</h2>
                  <div className="flex items-center space-x-2">
                    <span className="text-meta-light">Participant Agreement...</span>
                    <X className="h-4 w-4 text-meta-muted" />
                  </div>
                  <p className="text-sm text-red-400">
                    You must sign the above agreement to obtain a game code. Note: It may take an hour or two for the system to reflect completion of your signed agreement.
                  </p>
                </div>

                {/* Parent/Guardian Information */}
                {!form.watch('is_18_or_over') && (
                  <div className="space-y-4">
                    <h2 className="text-xl font-semibold text-meta-light">Parent/Guardian Information</h2>
                    
                    <FormField
                      control={form.control}
                      name="parent_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-meta-light">Parent/Guardian Name *</FormLabel>
                          <FormControl>
                            <Input 
                              {...field}
                              placeholder="Enter parent or guardian name" 
                              className="bg-meta-dark border-meta-border text-meta-light placeholder:text-meta-muted"
                            />
                          </FormControl>
                          <FormMessage />
                          <p className="text-sm text-meta-muted mt-1">
                            A parent or guardian name and email is required for participants under 18 years of age.
                          </p>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="parent_email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-meta-light">Parent/Guardian Email *</FormLabel>
                          <FormControl>
                            <Input 
                              {...field}
                              type="email" 
                              placeholder="Enter parent or guardian email" 
                              className="bg-meta-dark border-meta-border text-meta-light placeholder:text-meta-muted"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

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
                    
                    <FormField
                      control={form.control}
                      name="competition_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-meta-light">Select Competition Type</FormLabel>
                          <FormControl>
                            <RadioGroup 
                              onValueChange={field.onChange} 
                              value={field.value}
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
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
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
                    <div>
                      <h3 className="font-medium text-meta-light">Web Application Security</h3>
                      <p className="text-meta-muted">Identifying and exploiting web vulnerabilities</p>
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
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
