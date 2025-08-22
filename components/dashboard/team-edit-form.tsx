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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Edit, Users, Settings } from 'lucide-react';
import { TeamMemberManager } from '@/components/dashboard/team-member-manager';

const editTeamSchema = z.object({
  name: z.string().min(2, 'Team name must be at least 2 characters'),
  description: z.string().optional(),
  division: z.string().optional(),
  status: z.enum(['forming', 'active', 'archived']),
});

interface Team {
  id: string;
  name: string;
  description?: string;
  division?: string;
  status: 'forming' | 'active' | 'archived';
  created_at: string;
}



interface TeamEditFormProps {
  team: Team;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function TeamEditForm({ team, open, onOpenChange, onSuccess }: TeamEditFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  
  const form = useForm<z.infer<typeof editTeamSchema>>({
    resolver: zodResolver(editTeamSchema),
    defaultValues: {
      name: team?.name || '',
      description: team?.description || '',
      division: team?.division || '',
      status: team?.status || 'forming',
    },
  });

  // Update form when team changes
  useEffect(() => {
    if (team) {
      form.reset({
        name: team.name || '',
        description: team.description || '',
        division: team.division || '',
        status: team.status || 'forming',
      });
      fetchTeamMembers();
    }
  }, [team, form]);

  const fetchTeamMembers = async () => {
    try {
      const response = await fetch(`/api/teams/${team.id}/members`);
      if (response.ok) {
        const data = await response.json();
        setMembers(data.members || []);
      }
    } catch (error) {
      console.error('Error fetching team members:', error);
    }
  };

  async function onSubmit(values: z.infer<typeof editTeamSchema>) {
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/teams/${team.id}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update team');
      }
      
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating team:', error);
    } finally {
      setIsSubmitting(false);
    }
  }



  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto bg-gradient-to-br from-blue-50 to-indigo-100 border-blue-200">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Edit Team: {team?.name}</DialogTitle>
          <DialogDescription className="text-gray-700">
            Update team information and manage members
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Team Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">Team Information</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-700">Team Name *</FormLabel>
                      <FormControl>
                        <Input {...field} className="bg-white border-gray-300 text-gray-900" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-700">Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-white border-gray-300">
                          <SelectItem value="forming">Forming</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="archived">Archived</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

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
                          <SelectValue placeholder="Select division" />
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
            </div>

            {/* Team Members Management */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">Team Members</h3>
                <span className="text-sm text-gray-600">{members.length}/6 members</span>
              </div>
              
              <TeamMemberManager 
                teamId={team.id} 
                teamName={team.name} 
                onSuccess={() => {
                  fetchTeamMembers();
                  onSuccess();
                }}
              />
            </div>

            {/* Form Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="border-gray-300 text-gray-700 hover:bg-gray-50">
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700">
                {isSubmitting ? 'Updating...' : 'Update Team'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
