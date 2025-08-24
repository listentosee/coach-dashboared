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

const editFormSchema = z.object({
  first_name: z.string().min(2, 'First name must be at least 2 characters'),
  last_name: z.string().min(2, 'Last name must be at least 2 characters'),
  email_personal: z.string().email('Invalid email').optional().or(z.literal('')),
  email_school: z.string().email('Invalid email').optional().or(z.literal('')),
  is_18_or_over: z.boolean(),
  grade: z.string().optional(),
});

interface CompetitorEditFormProps {
  competitor: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CompetitorEditForm({ competitor, open, onOpenChange, onSuccess }: CompetitorEditFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const form = useForm<z.infer<typeof editFormSchema>>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      email_personal: competitor?.email_personal || '',
      email_school: competitor?.email_school || '',
      first_name: competitor?.first_name || '',
      last_name: competitor?.last_name || '',
      is_18_or_over: competitor?.is_18_or_over || false,
      grade: competitor?.grade || '',
    },
  });

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
        grade: competitor.grade || '',
      });
    }
  }, [competitor, form]);

  async function onSubmit(values: z.infer<typeof editFormSchema>) {
    setIsSubmitting(true);
    
    try {
      const response = await fetch(`/api/competitors/${competitor.id}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update competitor');
      }
      
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating competitor:', error);
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
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="email_school"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-700">School Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} className="bg-white border-gray-300 text-gray-900" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
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
              </div>


            </div>

            {/* Form Actions */}
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="border-gray-300 text-white hover:bg-white hover:text-gray-900">
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white">
                {isSubmitting ? 'Updating...' : 'Update Competitor'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
