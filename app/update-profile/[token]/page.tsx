'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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
import { X, Loader2, CheckCircle2 } from 'lucide-react';
import { normalizeEmail } from '@/lib/validation/email-uniqueness';

// Dynamic schema based on user age
const createProfileUpdateSchema = (is18OrOver: boolean) => {
  const baseSchema = {
    first_name: z.string().min(2, 'First name must be at least 2 characters'),
    last_name: z.string().min(2, 'Last name must be at least 2 characters'),
    grade: z.string().min(1, 'Grade is required'),
    gender: z.string().min(1, 'Gender is required'),
    race: z.string().min(1, 'Race is required'),
    ethnicity: z.string().min(1, 'Ethnicity is required'),
    years_competing: z.string().min(1, 'Years competing is required'),
    level_of_technology: z.string().min(1, 'Level of technology is required'),
    competition_type: z.enum(['trove', 'gymnasium', 'mayors_cup']),
    email_personal: z.string().email('Valid email is required').optional(),
  };

  if (!is18OrOver) {
    return z.object({
      ...baseSchema,
      parent_name: z.string().min(1, 'Parent/Guardian name is required'),
      parent_email: z.string().email('Valid email is required'),
    });
  }

  return z.object(baseSchema);
};

interface CompetitorProfile {
  id: string;
  first_name: string;
  last_name: string;
  grade?: string;
  gender?: string;
  race?: string;
  ethnicity?: string;
  years_competing?: number | null;
  level_of_technology?: string;
  is_18_or_over?: boolean;
  email_personal?: string;
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
  const [sending, setSending] = useState(false);

  const [schema, setSchema] = useState<z.ZodSchema | null>(null);
  const [emailValidation, setEmailValidation] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const lastValidatedEmail = useRef<string>('');
  const initialParentEmail = useRef<string>('');

  const form = useForm({
    resolver: schema ? zodResolver(schema) : undefined,
    defaultValues: {
      first_name: '',
      last_name: '',
      grade: '',
      gender: '',
      race: '',
      ethnicity: '',
      years_competing: '',
      level_of_technology: '',
      email_personal: '',
      parent_name: '',
      parent_email: '',
      competition_type: 'mayors_cup' as const,
    },
  });

  // Watch personal email after form is initialized
  const personalWatch = form.watch('email_personal');

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await fetch(`/api/competitors/profile/${params.token}`);
        if (!response.ok) {
          throw new Error('Profile not found or token expired');
        }
        
        const data = await response.json();
        setProfile(data.profile);

        // Set schema based on user age
        const userSchema = createProfileUpdateSchema(data.profile.is_18_or_over || false);
        setSchema(userSchema);

        // Track initial parent email — skip validation for pre-loaded value
        const loadedParentEmail = (data.profile.parent_email || '').trim().toLowerCase();
        initialParentEmail.current = loadedParentEmail;
        if (loadedParentEmail && !data.profile.is_18_or_over) {
          lastValidatedEmail.current = loadedParentEmail;
          setEmailValidation('valid');
        }
        
        // Pre-fill form with existing data
        form.reset({
          first_name: data.profile.first_name || '',
          last_name: data.profile.last_name || '',
          grade: data.profile.grade || '',
          gender: data.profile.gender || '',
          race: data.profile.race || '',
          ethnicity: data.profile.ethnicity || '',
          years_competing: (data.profile.years_competing !== null && data.profile.years_competing !== undefined)
            ? data.profile.years_competing.toString()
            : '',
          level_of_technology: data.profile.level_of_technology || '',
          email_personal: data.profile.email_personal || '',
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

  const validateParentEmail = useCallback(async (email: string) => {
    const normalized = email.trim().toLowerCase();

    // Empty or not a basic email shape — let Zod handle it
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setEmailValidation('idle');
      lastValidatedEmail.current = '';
      return;
    }

    // Already validated this exact email
    if (normalized === lastValidatedEmail.current) {
      return;
    }

    // Same as the stored value — trust it
    if (normalized === initialParentEmail.current) {
      lastValidatedEmail.current = normalized;
      setEmailValidation('valid');
      return;
    }

    setEmailValidation('validating');
    form.clearErrors('parent_email');

    try {
      const res = await fetch('/api/validate-parent-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalized }),
      });
      const data = await res.json();

      if (!data.valid) {
        lastValidatedEmail.current = '';
        setEmailValidation('invalid');
        form.setError('parent_email', {
          type: 'manual',
          message: data.message || 'This email address appears to be undeliverable.',
        });
        return;
      }

      lastValidatedEmail.current = normalized;
      setEmailValidation('valid');
    } catch {
      // Graceful degradation — allow submit if validation endpoint fails
      lastValidatedEmail.current = normalized;
      setEmailValidation('valid');
    }
  }, [form]);

  const onSubmit = async (values: any) => {
    console.log('Form submitted with values:', values);

    // Only send fields that are in the current schema
    const submissionData = { ...values };
    if (profile?.is_18_or_over) {
      delete submissionData.parent_name;
      delete submissionData.parent_email;
    }

    // Convert years_competing from string to number for API
    const parsedYearsCompeting = parseInt(submissionData.years_competing, 10);
    if (Number.isNaN(parsedYearsCompeting)) {
      form.setError('years_competing', {
        type: 'manual',
        message: 'Years competing is required',
      });
      return;
    }
    submissionData.years_competing = parsedYearsCompeting;

    try {
      const response = await fetch(`/api/competitors/profile/${params.token}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submissionData),
      });

      console.log('Response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('API error:', errorData);
        if (response.status === 422 && errorData?.field === 'parent_email') {
          form.setError('parent_email', {
            type: 'manual',
            message: errorData.message || 'This email address appears to be undeliverable. Please check and try again.',
          });
          setError(errorData.message || 'Parent email appears to be undeliverable.');
          return;
        }
        if (response.status === 409 && Array.isArray(errorData?.details?.conflicts)) {
          const normalizedPersonal = normalizeEmail(values.email_personal);
          let conflictFound = false;
          errorData.details.conflicts.forEach((conflict: any) => {
            const conflictEmail = conflict?.email;
            if (normalizedPersonal && conflictEmail === normalizedPersonal) {
              conflictFound = true;
              form.setError('email_personal', {
                type: 'manual',
                message: 'This email is already associated with another account.',
              });
            }
          });
          if (conflictFound) {
            setError('This email is already associated with another account.');
            return;
          }
        }
        throw new Error(errorData?.error || 'Failed to update profile');
      }

      const result = await response.json();
      console.log('Success response:', result);
      setSuccess(true);
    } catch (error: any) {
      console.error('Submission error:', error);
      setError(error.message);
    }
  };

  const sendParticipation = async () => {
    try {
      if (!profile?.is_18_or_over) {
        alert('Participation agreement is available for 18+ participants only.');
        return;
      }
      setSending(true);
      const personal = (form.getValues('email_personal') || '').trim();
      const res = await fetch(`/api/competitors/profile/${params.token}/send-participation`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_personal: personal })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || 'Failed to send participation agreement');
      }
      alert(`A participation agreement has been sent to ${personal}.`);
    } catch (e: any) {
      alert(e?.message || 'Failed to send participation agreement');
    } finally {
      setSending(false);
    }
  }

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
          <p className="text-meta-muted mt-2"></p>
        </div>

        <Card className="bg-meta-card border-meta-border">
          <CardContent className="p-8">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit, (errors) => {
                console.error('Form validation errors:', errors);
              })} className="space-y-8">
                {/* Personal Information */}
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold text-meta-light">Personal Information</h2>
                  
                  {/* Row 1: Ethnicity and Race */}
                  <div className="grid grid-cols-2 gap-4">
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
                  </div>

                  {/* Row 2: Gender and Level of Technology */}
                  <div className="grid grid-cols-2 gap-4">
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

                    <FormField
                      control={form.control}
                      name="level_of_technology"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-meta-light">Level of Technology *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-meta-dark border-meta-border text-meta-light">
                                <SelectValue placeholder="Select platform" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-meta-card border-meta-border text-meta-light">
                              <SelectItem value="pc">PC</SelectItem>
                              <SelectItem value="mac">MAC</SelectItem>
                              <SelectItem value="chrome_book">Chrome Book</SelectItem>
                              <SelectItem value="linux">Linux</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Row 3: Years Competing and Personal Email + Send */}
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="years_competing"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-meta-light">Years Competing *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-meta-dark border-meta-border text-meta-light">
                                <SelectValue placeholder="Select years" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-meta-card border-meta-border text-meta-light">
                              {Array.from({ length: 21 }, (_, i) => (
                                <SelectItem key={i} value={i.toString()}>
                                  {i} {i === 1 ? 'year' : 'years'}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="email_personal"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-meta-light">Personal Email</FormLabel>
                          <FormControl>
                            <div className="flex items-center gap-2">
                              <Input
                                {...field}
                                type="email"
                                placeholder="Enter your personal email"
                                className="flex-1 bg-meta-dark border-meta-border text-meta-light placeholder:text-meta-muted"
                              />
                              {profile?.is_18_or_over && (
                                <Button
                                  type="button"
                                  onClick={sendParticipation}
                                  disabled={sending || !(personalWatch && /.+@.+\..+/.test(String(personalWatch).trim()))}
                                  className="bg-meta-accent hover:bg-blue-600 whitespace-nowrap"
                                  title="Send participation agreement to your personal email"
                                >
                                  {sending ? 'Sending…' : 'Send for Signature'}
                                </Button>
                              )}
                            </div>
                          </FormControl>
                          {profile?.is_18_or_over && (
                            <p className="text-xs text-meta-muted mt-1">We will send the participation agreement to your personal email shown here.</p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Parent/Guardian Information */}
                {profile && !profile.is_18_or_over && (
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
                              onChange={(e) => {
                                field.onChange(e);
                                // Reset validation when user types
                                if (emailValidation !== 'idle') {
                                  setEmailValidation('idle');
                                  lastValidatedEmail.current = '';
                                }
                              }}
                              onBlur={(e) => {
                                field.onBlur();
                                validateParentEmail(e.target.value);
                              }}
                            />
                          </FormControl>
                          {emailValidation === 'validating' && (
                            <p className="text-xs text-meta-muted flex items-center gap-1 mt-1">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Verifying email...
                            </p>
                          )}
                          {emailValidation === 'valid' && (
                            <p className="text-xs text-green-500 flex items-center gap-1 mt-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Email verified
                            </p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {/* 18+: Send button now sits beside Personal Email field above */}

                {/* Submit and Cancel Buttons */}
                <div className="flex justify-center space-x-4">
                  <Button type="button" variant="outline" size="lg" onClick={() => window.close()} className="border-meta-border text-meta-light hover:bg-meta-accent hover:text-white">
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="lg"
                    className="bg-meta-accent hover:bg-blue-600"
                    disabled={!profile?.is_18_or_over && (emailValidation === 'validating' || emailValidation === 'invalid')}
                  >
                    {emailValidation === 'validating' ? 'Verifying Email...' : 'Update Profile'}
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
