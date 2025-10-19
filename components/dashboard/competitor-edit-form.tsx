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
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Edit } from 'lucide-react';
import { normalizeEmail } from '@/lib/validation/email-uniqueness';

const editFormSchema = z.object({
  first_name: z.string().min(2, 'First name must be at least 2 characters'),
  last_name: z.string().min(2, 'Last name must be at least 2 characters'),
  email_personal: z.string().email('Invalid email').optional().or(z.literal('')),
  // School email required
  email_school: z.string({ required_error: 'School email is required' }).email('Invalid email'),
  is_18_or_over: z.boolean(),
  grade: z.string().optional(),
  division: z.enum(['middle_school','high_school','college']).optional(),
  program_track: z.enum(['traditional','adult_ed']).optional().or(z.literal('')).or(z.null()),
});

interface CompetitorEditFormProps {
  competitor: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CompetitorEditForm({ competitor, open, onOpenChange, onSuccess }: CompetitorEditFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailValidation, setEmailValidation] = useState<{ school?: string; personal?: string; summary?: string }>({});
  const [isCheckingEmails, setIsCheckingEmails] = useState(false);
  
  
  const form = useForm<z.infer<typeof editFormSchema>>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      email_personal: competitor?.email_personal || '',
      email_school: competitor?.email_school || '',
      first_name: competitor?.first_name || '',
      last_name: competitor?.last_name || '',
      is_18_or_over: competitor?.is_18_or_over || false,
      grade: competitor?.grade || ((competitor as any)?.division === 'college' ? 'college' : ''),
      division: (competitor as any)?.division || 'high_school',
      program_track: (competitor as any)?.program_track || ((competitor as any)?.division === 'college' ? 'traditional' : null),
    },
  });

  const emailSchoolWatch = form.watch('email_school');
  const emailPersonalWatch = form.watch('email_personal');
  const divisionWatch = form.watch('division');
  const programTrackWatch = form.watch('program_track');
  const gradeWatch = form.watch('grade');

  useEffect(() => {
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
  }, [divisionWatch, programTrackWatch, gradeWatch, form]);

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
            ignoreCompetitorIds: competitor?.id ? [competitor.id] : [],
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
          console.error('Email validation failed with status', response.status);
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
  }, [emailSchoolWatch, emailPersonalWatch, competitor?.id, form]);

  // Update form when competitor changes
  useEffect(() => {
    if (competitor) {
      console.log('Competitor data for form:', competitor);
      form.reset({
        email_personal: competitor.email_personal || '',
        email_school: competitor.email_school || '',
        first_name: competitor.first_name || '',
        last_name: competitor.last_name || '',
        is_18_or_over: competitor.is_18_or_over || false,
        grade: competitor.grade || (competitor.division === 'college' ? 'college' : ''),
        division: (competitor as any).division || 'high_school',
        program_track: (competitor as any).program_track || ((competitor as any).division === 'college' ? 'traditional' : null),
      });
      setEmailValidation({});
    }
  }, [competitor, form]);

  // Ensure submit state resets whenever the dialog opens
  useEffect(() => {
    if (open) {
      setIsSubmitting(false);
    } else {
      setEmailValidation({});
      setIsCheckingEmails(false);
    }
  }, [open]);

  async function onSubmit(values: z.infer<typeof editFormSchema>) {
    setIsSubmitting(true);
    
    try {
      // Hard timeout to avoid UI hanging if a request stalls
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 15000);
      const selectedDivision = values.division ?? (competitor?.division as string | null) ?? null
      const payload = {
        ...values,
        program_track: selectedDivision === 'college'
          ? ((values.program_track || competitor?.program_track || 'traditional') as 'traditional' | 'adult_ed')
          : null,
      }

      const response = await fetch(`/api/competitors/${competitor.id}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(t);

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
        throw new Error(errorData?.error || 'Failed to update competitor');
      }
      
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        console.error('Update timed out');
        alert('Update timed out. Please try again.');
      } else {
        console.error('Error updating competitor:', error);
        if (!error?.message?.includes('Email already in use')) {
          alert(`Failed to update competitor: ${error?.message || 'Unknown error'}`);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto bg-gradient-to-br from-blue-50 to-indigo-100 border-blue-200">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Edit Competitor</DialogTitle>
          <DialogDescription className="text-gray-700">
            Update competitor information and track form status
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">Basic Information</h3>
              
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

              {/* Email fields - always required */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email_personal"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-700">Personal Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} className="bg-white border-gray-300 text-gray-900" />
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
                        <Input type="email" {...field} className="bg-white border-gray-300 text-gray-900" />
                      </FormControl>
                      <FormMessage />
                      {emailValidation.school && (
                        <p className="text-sm text-red-600 mt-1">{emailValidation.school}</p>
                      )}
                    </FormItem>
                  )}
                />
              </div>

              {emailValidation.summary && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2">
                  {emailValidation.summary}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
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
                <FormField
                  control={form.control}
                  name="is_18_or_over"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-700">18 or older</FormLabel>
                      <FormControl>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            className="h-4 w-4 border-gray-300"
                          />
                          <span className="text-sm text-gray-600">Yes, competitor is 18 or older</span>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {divisionWatch === 'college' && (
                  <FormField
                    control={form.control}
                    name="program_track"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel className="text-gray-700">College Track</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || 'traditional'}>
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
                        <FormLabel className="text-gray-700">Grade</FormLabel>
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
              </div>


            </div>

            {/* Form Actions */}
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="border-gray-300 text-white hover:bg-white hover:text-gray-900"
              >
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
                {isSubmitting ? 'Updating...' : isCheckingEmails ? 'Validating...' : 'Update Competitor'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
