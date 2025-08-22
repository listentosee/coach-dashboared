'use client';

import { useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlusCircle, Plus } from 'lucide-react';

const teamFormSchema = z.object({
  name: z.string().min(2, 'Team name must be at least 2 characters'),
  description: z.string().optional(),
  division: z.string().optional(),
});

export function TeamForm({ onSuccess, variant = 'default' }: { onSuccess?: () => void; variant?: 'default' | 'compact' }) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const form = useForm<z.infer<typeof teamFormSchema>>({
    resolver: zodResolver(teamFormSchema),
    defaultValues: {
      name: '',
      description: '',
      division: '',
    },
  });

  async function onSubmit(values: z.infer<typeof teamFormSchema>) {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/teams/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create team');
      }
      
      // Call onSuccess to refresh the teams list
      onSuccess?.();
      
      // Reset form and close modal
      form.reset();
      setOpen(false);
      
    } catch (error) {
      console.error('Error creating team:', error);
      // You could add toast notification here
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleClose = () => {
    setOpen(false);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {variant === 'compact' ? (
          <Button size="sm" className="h-8 w-8 p-0 bg-meta-accent hover:bg-blue-600">
            <Plus className="h-4 w-4" />
          </Button>
        ) : (
          <Button className="bg-meta-accent hover:bg-blue-600">
            <PlusCircle className="mr-2 h-4 w-4" />
            Create Team
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-gradient-to-br from-blue-50 to-indigo-100 border-blue-200">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Create New Team</DialogTitle>
          <DialogDescription className="text-gray-700">
            Create a new team for your competitors. Teams can have up to 6 members.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-700">Team Name *</FormLabel>
                  <FormControl>
                    <Input {...field} className="bg-white border-gray-300 text-gray-900" placeholder="Enter team name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-700">Description</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      className="bg-white border-gray-300 text-gray-900" 
                      placeholder="Optional team description"
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
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
                        <SelectValue placeholder="Select division (optional)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-white border-gray-300">
                      <SelectItem value="varsity">Varsity</SelectItem>
                      <SelectItem value="junior_varsity">Junior Varsity</SelectItem>
                      <SelectItem value="freshman">Freshman</SelectItem>
                      <SelectItem value="mixed">Mixed</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={handleClose} className="border-gray-300 text-gray-700 hover:bg-gray-50">
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700">
                {isSubmitting ? 'Creating...' : 'Create Team'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
