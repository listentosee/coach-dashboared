'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import '@/styles/job-playbook.css';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface JobPlaybookDialogProps {
  content: string;
  totalJobs?: number | null;
  variant?: 'default' | 'outline';
}

const MarkdownPreview = dynamic(() => import('@uiw/react-markdown-preview'), { ssr: false });

export function JobPlaybookDialog({ content, totalJobs, variant = 'outline' }: JobPlaybookDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size="sm">
          View operations playbook
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] w-full max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Job Queue Operational Playbook</DialogTitle>
          <DialogDescription className="text-gray-600">
            Procedures for monitoring, pausing, and recovering the Game Platform job queue.
          </DialogDescription>
          {typeof totalJobs === 'number' && (
            <div className="text-xs text-gray-600">Current queue size: {totalJobs}</div>
          )}
        </DialogHeader>
        <MarkdownPreview
          source={content}
          style={{ backgroundColor: 'transparent' }}
          className="markdown-preview"
        />
      </DialogContent>
    </Dialog>
  );
}
