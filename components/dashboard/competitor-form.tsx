'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlusCircle, Copy, Plus } from 'lucide-react';
import { normalizeEmail } from '@/lib/validation/email-uniqueness';

const formSchema = z.object({
  first_name: z.string().min(2, 'First name must be at least 2 characters'),
  last_name: z.string().min(2, 'Last name must be at least 2 characters'),
  is_18_or_over: z.boolean(),
  grade: z.string({ required_error: 'Grade is required' }).min(1, 'Grade is required'),
  email_personal: z.string().email('Invalid email').optional().or(z.literal('')),
  // School email required for all participants
  email_school: z.string({ required_error: 'School email is required' }).email('Invalid email'),
  division: z.enum(['middle_school','high_school','college'], { required_error: 'Division is required' }),
  program_track: z.enum(['traditional','adult_ed']).optional().or(z.literal('')).or(z.null()),
}).refine(
  (data) => data.division !== 'college' || !!(data.program_track ?? '').trim(),
  {
    message: 'Select College track',
    path: ['program_track'],
  }
);

export function CompetitorForm({ onSuccess, variant = 'default', disabled = false, disabledTooltip }: { onSuccess?: () => void; variant?: 'default' | 'compact'; disabled?: boolean; disabledTooltip?: string }) {
  const [open, setOpen] = useState(false);
  const [profileLink, setProfileLink] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [existingCompetitors, setExistingCompetitors] = useState<any[]>([]);
  const [emailValidation, setEmailValidation] = useState<{ school?: string; personal?: string; summary?: string }>({});
  const [isCheckingEmails, setIsCheckingEmails] = useState(false);
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      is_18_or_over: false,
      grade: '',
      email_personal: '',
      email_school: '',
      division: 'high_school',
      program_track: null,
    },
  });

  // Check for duplicate names when first/last change (stable deps)
  const firstNameWatch = form.watch('first_name');
  const lastNameWatch = form.watch('last_name');
  const emailSchoolWatch = form.watch('email_school');
  const emailPersonalWatch = form.watch('email_personal');
  const divisionWatch = form.watch('division');
  const programTrackWatch = form.watch('program_track');
  const gradeWatch = form.watch('grade');
  const isAdultWatch = form.watch('is_18_or_over');

  useEffect(() => {
    if (isAdultWatch) {
      if (divisionWatch !== 'college') {
        form.setValue('division', 'college', { shouldDirty: false });
      }
      if (programTrackWatch !== 'traditional') {
        form.setValue('program_track', 'traditional', { shouldDirty: false });
      }
      if (gradeWatch !== 'college') {
        form.setValue('grade', 'college', { shouldDirty: false });
      }
      return;
    }

    if (divisionWatch === 'college') {
      if (!programTrackWatch || programTrackWatch === '') {
        form.setValue('program_track', 'traditional', { shouldDirty: false });
      }
      if (gradeWatch !== 'college') {
        form.setValue('grade', 'college', { shouldDirty: false });
      }
    } else if (programTrackWatch) {
      form.setValue('program_track', null, { shouldDirty: false });
      if (gradeWatch === 'college') {
        form.setValue('grade', '', { shouldDirty: false });
      }
    }
  }, [isAdultWatch, divisionWatch, programTrackWatch, gradeWatch, form]);
  useEffect(() => {
    const checkDuplicates = async () => {
      const first_name = (firstNameWatch || '').trim();
      const last_name = (lastNameWatch || '').trim();
      if (first_name.length >= 2 && last_name.length >= 2) {
        try {
          const response = await fetch('/api/competitors/check-duplicates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ first_name, last_name }),
          });
          if (response.ok) {
            const data = await response.json();
            if (data.duplicates && data.duplicates.length > 0) {
              setDuplicateWarning(`Warning: Found ${data.duplicates.length} competitor(s) with similar names. Please verify this is not a duplicate.`);
              setExistingCompetitors(data.duplicates);
            } else {
              setDuplicateWarning(null);
              setExistingCompetitors([]);
            }
          }
        } catch (error) {
          console.error('Error checking duplicates:', error);
        }
      } else {
        setDuplicateWarning(null);
        setExistingCompetitors([]);
      }
    };
    const debounceTimer = setTimeout(checkDuplicates, 300);
    return () => clearTimeout(debounceTimer);
  }, [firstNameWatch, lastNameWatch]);

  useEffect(() => {
    const controller = new AbortController();

    const run = async () => {
      const normalizedSchool = normalizeEmail(emailSchoolWatch);
      const normalizedPersonal = normalizeEmail(emailPersonalWatch);
      form.clearErrors(['email_school', 'email_personal']);
      setEmailValidation({});

      if (!normalizedSchool && !normalizedPersonal) {
        setIsCheckingEmails(false);
        return;
      }

      setIsCheckingEmails(true);

      try {
        const response = await fetch('/api/validation/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            emails: [normalizedSchool, normalizedPersonal].filter(Boolean),
          }),
          signal: controller.signal,
        });

        if (response.status === 409) {
          const data = await response.json().catch(() => ({}));
          const conflicts = Array.isArray(data?.details?.conflicts) ? data.details.conflicts : [];
          const nextErrors: { school?: string; personal?: string; summary?: string } = {};

          conflicts.forEach((conflict: any) => {
            const conflictEmail = conflict?.email;
            if (!conflictEmail) return;
            if (normalizedSchool && conflictEmail === normalizedSchool) {
              nextErrors.school = 'This school email is already in use.';
              form.setError('email_school', { type: 'manual', message: nextErrors.school });
            }
            if (normalizedPersonal && conflictEmail === normalizedPersonal) {
              nextErrors.personal = 'This personal email is already in use.';
              form.setError('email_personal', { type: 'manual', message: nextErrors.personal });
            }
          });

          if (!nextErrors.school && !nextErrors.personal) {
            nextErrors.summary = 'One or more emails are already in use.';
          }

          setEmailValidation(nextErrors);
        } else if (!response.ok) {
          console.error('Email validation request failed with status', response.status);
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          console.error('Email validation error:', error);
        }
      } finally {
        setIsCheckingEmails(false);
      }
    };

    const timeout = setTimeout(run, 300);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [emailSchoolWatch, emailPersonalWatch, form]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true);
    try {
      const payload = {
        ...values,
        program_track: values.division === 'college'
          ? ((values.program_track || 'traditional') as 'traditional' | 'adult_ed')
          : null,
      };

      const response = await fetch('/api/competitors/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 409 && Array.isArray(errorData?.details?.conflicts)) {
          const normalizedSchool = normalizeEmail(emailSchoolWatch);
          const normalizedPersonal = normalizeEmail(emailPersonalWatch);
          const nextErrors: { school?: string; personal?: string; summary?: string } = {};
          errorData.details.conflicts.forEach((conflict: any) => {
            const conflictEmail = conflict?.email;
            if (!conflictEmail) return;
            if (normalizedSchool && conflictEmail === normalizedSchool) {
              nextErrors.school = 'This school email is already in use.';
              form.setError('email_school', { type: 'manual', message: nextErrors.school });
            }
            if (normalizedPersonal && conflictEmail === normalizedPersonal) {
              nextErrors.personal = 'This personal email is already in use.';
              form.setError('email_personal', { type: 'manual', message: nextErrors.personal });
            }
          });
          if (!nextErrors.school && !nextErrors.personal) {
            nextErrors.summary = 'One or more emails are already in use.';
          }
          setEmailValidation(nextErrors);
          setIsSubmitting(false);
          return;
        }
        throw new Error(errorData?.error || 'Failed to create competitor');
      }
      
      const data = await response.json();
      setProfileLink(data.profileUpdateUrl);
      
      // Call onSuccess to refresh the competitors list
      onSuccess?.();
      
      // Reset form
      form.reset();
      
    } catch (error: any) {
      console.error('Error creating competitor:', error);
      if (!error?.message?.includes('Email already in use')) {
        // You could add toast notification here
        alert(error?.message || 'Failed to create competitor');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const copyToClipboard = () => {
    if (profileLink) {
      navigator.clipboard.writeText(profileLink);
      // You could add toast notification here
    }
  };

  const handleClose = () => {
    setOpen(false);
    setProfileLink(null);
    form.reset();
    setEmailValidation({});
  };

  const handleAddAnother = () => {
    setProfileLink(null);
    form.reset();
    setEmailValidation({});
    // Keep modal open for another entry
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {variant === 'compact' ? (
          <Button size="sm" className="h-8 w-8 p-0" disabled={disabled} title={disabled ? (disabledTooltip || 'Select a coach to edit') : undefined}>
            <Plus className="h-4 w-4" />
          </Button>
        ) : (
          <Button disabled={disabled} title={disabled ? (disabledTooltip || 'Select a coach to edit') : undefined}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Competitor
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-gradient-to-br from-blue-50 to-indigo-100 border-blue-200">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Add New Competitor</DialogTitle>
          <DialogDescription className="text-gray-700">
            Enter the competitor&apos;s basic information. They will receive a secure link to complete their profile.
          </DialogDescription>
        </DialogHeader>
        
        {profileLink ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-semibold text-green-800 mb-2">Success!</h4>
              <p className="text-sm text-green-700 mb-3">
                Share this secure link with the competitor to complete their profile:
              </p>
              <div className="flex gap-2">
                <Input value={profileLink} readOnly className="text-xs bg-white border-gray-300 text-gray-900" />
                <Button size="sm" onClick={copyToClipboard}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-green-600 mt-2">
                This link expires in 7 days
              </p>
            </div>
            <Button onClick={handleAddAnother} className="w-full bg-blue-600 hover:bg-blue-700">
              Add Another Competitor
            </Button>
            <Button onClick={handleClose} className="w-full" variant="outline">
              Close
            </Button>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Duplicate Warning */}
              {duplicateWarning && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-yellow-800">Duplicate Warning</h3>
                      <div className="mt-2 text-sm text-yellow-700">
                        <p>{duplicateWarning}</p>
                        {existingCompetitors.length > 0 && (
                          <div className="mt-2">
                            <p className="font-medium">Existing competitors:</p>
                            <ul className="mt-1 space-y-1">
                              {existingCompetitors.map((comp, index) => (
                                <li key={index} className="text-xs">
                                  • {comp.first_name} {comp.last_name} 
                                  {comp.email_school && ` (${comp.email_school})`}
                                  {comp.grade && ` - Grade ${comp.grade}`}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-700">First Name</FormLabel>
                      <FormControl>
                        <Input {...field} className="bg-white border-gray-300 text-gray-900" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
              )}
            />

                <FormField
                  control={form.control}
                  name="last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-700">Last Name</FormLabel>
                      <FormControl>
                        <Input {...field} className="bg-white border-gray-300 text-gray-900" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>



              <FormField
                control={form.control}
                name="is_18_or_over"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-gray-300 p-3 bg-white">
                    <div className="space-y-0.5">
                      <FormLabel className="text-gray-700">18 or Over</FormLabel>
                      <FormDescription className="text-gray-600">
                        Is the competitor 18 years or older?
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

              <FormField
                control={form.control}
                name="division"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-700">Division</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                          <SelectValue placeholder="Select division" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-white border-gray-300 text-gray-900">
                        <SelectItem value="middle_school">Middle School</SelectItem>
                        <SelectItem value="high_school">High School</SelectItem>
                        <SelectItem value="college">College</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {divisionWatch === 'college' && (
                <FormField
                  control={form.control}
                  name="program_track"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-700">College Track</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || 'traditional'}
                      >
                        <FormControl>
                          <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                            <SelectValue placeholder="Select track" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-white border-gray-300 text-gray-900">
                          <SelectItem value="traditional">Traditional College</SelectItem>
                          <SelectItem value="adult_ed">Adult Ed/Continuing Ed</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-xs text-gray-600">
                        Use Adult Ed/Continuing Ed for continuing or returning learners; Traditional for current college students.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {divisionWatch !== 'college' ? (
                <FormField
                  control={form.control}
                  name="grade"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-700">Grade (Required)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                            <SelectValue placeholder="Select grade level" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-white border-gray-300 text-gray-900">
                          <SelectItem value="6">6th Grade</SelectItem>
                          <SelectItem value="7">7th Grade</SelectItem>
                          <SelectItem value="8">8th Grade</SelectItem>
                          <SelectItem value="9">9th Grade</SelectItem>
                          <SelectItem value="10">10th Grade</SelectItem>
                          <SelectItem value="11">11th Grade</SelectItem>
                          <SelectItem value="12">12th Grade</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <div className="rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600">
                  Grade automatically set to <span className="font-semibold">College</span> for this division.
                </div>
              )}

              <FormField
                control={form.control}
                name="email_personal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-700">Personal Email (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        {...field}
                        className="bg-white border-gray-300 text-gray-900"
                      />
                    </FormControl>
                    <FormMessage />
                    {emailValidation.personal && (
                      <p className="text-sm text-red-600 mt-1">{emailValidation.personal}</p>
                    )}
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email_school"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-700">School Email (Required)</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        {...field}
                        className="bg-white border-gray-300 text-gray-900"
                      />
                    </FormControl>
                    <FormMessage />
                    {emailValidation.school && (
                      <p className="text-sm text-red-600 mt-1">{emailValidation.school}</p>
                    )}
                  </FormItem>
                )}
              />

              {emailValidation.summary && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {emailValidation.summary}
                </div>
              )}

              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={handleClose} className="border-gray-300 text-white hover:bg-white hover:text-gray-900">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    isCheckingEmails ||
                    Boolean(emailValidation.school || emailValidation.personal || emailValidation.summary)
                  }
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isSubmitting ? 'Adding...' : isCheckingEmails ? 'Validating...' : 'Add Competitor'}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
