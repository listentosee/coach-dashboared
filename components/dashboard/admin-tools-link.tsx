'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Settings } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

export default function AdminToolsLink() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUserRole();
  }, []);

  const checkUserRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      // Check if user has admin role
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      setIsAdmin(profile?.role === 'admin');
    } catch (error) {
      console.error('Error checking user role:', error);
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  };

  // Don't render anything while checking role
  if (loading) {
    return null;
  }

  // Only render admin tools link for admins
  if (!isAdmin) {
    return null;
  }

  return (
    <Link href="/dashboard/admin-tools">
      <Button variant="ghost" className="w-full justify-start text-meta-light hover:bg-meta-accent hover:text-white">
        <Settings className="h-5 w-5 mr-3" />
        Admin Tools
      </Button>
    </Link>
  );
}
