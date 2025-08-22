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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserPlus, Plus } from 'lucide-react';

const memberAssignmentSchema = z.object({
  competitor_id: z.string().min(1, 'Please select a competitor').optional(),
  position: z.number().min(1).max(6, 'Position must be between 1 and 6'),
});

interface Competitor {
  id: string;
  first_name: string;
  last_name: string;
  grade?: string;
  team_id?: string;
}

interface MemberAssignmentFormProps {
  teamId: string;
  teamName: string;
  onSuccess: () => void;
  variant?: 'default' | 'compact';
}

export function MemberAssignmentForm({ teamId, teamName, onSuccess, variant = 'default' }: MemberAssignmentFormProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [isLoadingCompetitors, setIsLoadingCompetitors] = useState(true);
  const [availablePositions, setAvailablePositions] = useState<number[]>([]);
  
  const form = useForm<z.infer<typeof memberAssignmentSchema>>({
    resolver: zodResolver(memberAssignmentSchema),
    defaultValues: {
      competitor_id: undefined,
      position: 1,
    },
  });

  // Fetch available competitors and positions when modal opens
  useEffect(() => {
    if (open) {
      fetchAvailableCompetitors();
      fetchAvailablePositions();
    }
  }, [open, teamId]);

  const fetchAvailableCompetitors = async () => {
    try {
      const response = await fetch('/api/competitors');
      if (response.ok) {
        const data = await response.json();
        // Filter out competitors already on teams
        const availableCompetitors = data.competitors?.filter((c: Competitor) => !c.team_id) || [];
        setCompetitors(availableCompetitors);
      }
    } catch (error) {
      console.error('Error fetching competitors:', error);
    } finally {
      setIsLoadingCompetitors(false);
    }
  };

  const fetchAvailablePositions = async () => {
    try {
      const response = await fetch(`/api/teams/${teamId}/members`);
      if (response.ok) {
        const data = await response.json();
        const takenPositions = data.members?.map((m: any) => m.position) || [];
        const allPositions = [1, 2, 3, 4, 5, 6];
        const available = allPositions.filter(p => !takenPositions.includes(p));
        setAvailablePositions(available);
      }
    } catch (error) {
      console.error('Error fetching team positions:', error);
    }
  };

  async function onSubmit(values: z.infer<typeof memberAssignmentSchema>) {
    if (!values.competitor_id) {
      alert('Please select a competitor');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/teams/${teamId}/members/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competitor_id: values.competitor_id,
          position: values.position,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add member');
      }
      
      onSuccess();
      form.reset();
      setOpen(false);
    } catch (error: any) {
      console.error('Error adding member:', error);
      alert('Failed to add member: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleClose = () => {
    setOpen(false);
    form.reset({
      competitor_id: undefined,
      position: 1,
    });
  };

  if (competitors.length === 0 && !isLoadingCompetitors) {
    return null; // Don't show the form if no competitors are available
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {variant === 'compact' ? (
          <Button size="sm" className="h-8 w-8 p-0 bg-green-600 hover:bg-green-700">
            <Plus className="h-4 w-4" />
          </Button>
        ) : (
          <Button className="bg-green-600 hover:bg-green-700">
            <UserPlus className="mr-2 h-4 w-4" />
            Add Member
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-gradient-to-br from-blue-50 to-indigo-100 border-blue-200">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Add Member to {teamName}</DialogTitle>
          <DialogDescription className="text-gray-700">
            Assign a competitor to this team. Select an available competitor and position.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="competitor_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-700">Select Competitor *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""}>
                    <FormControl>
                      <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                        <SelectValue placeholder="Choose a competitor" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-white border-gray-300">
                      {isLoadingCompetitors ? (
                        <SelectItem value="loading" disabled>Loading...</SelectItem>
                      ) : competitors.length === 0 ? (
                        <SelectItem value="no-competitors" disabled>No available competitors</SelectItem>
                      ) : (
                        competitors.map((competitor) => (
                          <SelectItem key={competitor.id} value={competitor.id}>
                            {competitor.first_name} {competitor.last_name}
                            {competitor.grade && ` (Grade ${competitor.grade})`}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="position"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-700">Position *</FormLabel>
                  <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value.toString()}>
                    <FormControl>
                      <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-white border-gray-300">
                      {availablePositions.map((position) => (
                        <SelectItem key={position} value={position.toString()}>
                          Position {position}
                        </SelectItem>
                      ))}
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
              <Button type="submit" disabled={isSubmitting || competitors.length === 0} className="bg-green-600 hover:bg-green-700">
                {isSubmitting ? 'Adding...' : 'Add Member'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
