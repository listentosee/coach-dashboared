'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';
import { CompetitorForm } from '@/components/dashboard/competitor-form';
import { CompetitorEditForm } from '@/components/dashboard/competitor-edit-form';
import { Edit, UserCheck, Gamepad2, Ban, LogIn, Link as LinkIcon, ChevronDown, Copy } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { createCompetitorColumns, Competitor as CompetitorType } from '@/components/dashboard/competitor-columns';
import { useAdminCoachContext } from '@/lib/admin/useAdminCoachContext';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface Competitor {
  id: string;
  first_name: string;
  last_name: string;
  email_personal?: string;
  email_school?: string;
  is_18_or_over?: boolean;
  grade?: string;
  division?: 'middle_school' | 'high_school' | 'college' | null;
  program_track?: 'traditional' | 'adult_ed' | null;
  status: string;
  media_release_signed: boolean;
  media_release_date?: string;
  participation_agreement_signed: boolean;
  participation_agreement_date?: string;
  game_platform_id?: string;
  game_platform_synced_at?: string;
  game_platform_sync_error?: string | null;
  game_platform_status?: string | null;
  game_platform_last_login_at?: string | null;
  team_id?: string;
  team_name?: string;
  team_position?: number;
  profile_update_token?: string;
  profile_update_token_expires?: string;
  created_at: string;
  is_active: boolean;
  coach_name?: string | null;
  coach_email?: string | null;
  coach_id?: string | null;
  parent_name?: string | null;
  parent_email?: string | null;
  gender?: string | null;
  race?: string | null;
  ethnicity?: string | null;
  level_of_technology?: string | null;
  years_competing?: number | null;
}

interface ProfileLinkDialogState {
  competitorName: string;
  recipients: string[];
  profileUrl: string;
  template: { subject: string; body: string };
  coachEmail?: string | null;
  coachName?: string | null;
}

interface DashboardStats {
  totalCompetitors: number;
  totalTeams: number;
  activeCompetitors: number;
  pendingCompetitors: number;
  profileCompetitors?: number;
  inTheGameNcCompetitors?: number;
}

const decorateCompetitor = (comp: any): Competitor => ({
  ...comp,
  media_release_signed: comp.media_release_signed || false,
  participation_agreement_signed: comp.participation_agreement_signed || false,
  is_active: comp.is_active !== undefined ? comp.is_active : true,
});

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  const { coachId, loading: ctxLoading } = useAdminCoachContext()
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalCompetitors: 0,
    totalTeams: 0,
    activeCompetitors: 0,
    pendingCompetitors: 0,
    profileCompetitors: 0,
    inTheGameNcCompetitors: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingCompetitor, setEditingCompetitor] = useState<Competitor | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [teams, setTeams] = useState<Array<{id: string, name: string, memberCount?: number}>>([]);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(true);
  const [session, setSession] = useState<any>(null);
  const sessionCoachId = session?.user?.id ?? null
  const [coachProfile, setCoachProfile] = useState<any>(null);
  const [divisionFilter, setDivisionFilter] = useState<'all' | 'middle_school' | 'high_school' | 'college'>('all');
  const [isAdmin, setIsAdmin] = useState(false)
  const [coachDirectory, setCoachDirectory] = useState<Record<string, { name?: string | null; email?: string | null }>>({})
  const [visibleCount, setVisibleCount] = useState(40)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const [adminTotal, setAdminTotal] = useState<number | null>(null)
  const [adminOffset, setAdminOffset] = useState<number>(0)
  const [adminLoading, setAdminLoading] = useState<boolean>(false)
  const adminInitLoadingRef = useRef<boolean>(false)
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const competitorIdSetRef = useRef<Set<string>>(new Set())
  const competitorsLengthRef = useRef<number>(0)
  const adminLoadingRef = useRef<boolean>(false)
  const [registeringId, setRegisteringId] = useState<string | null>(null)
  const [profileLinkDialog, setProfileLinkDialog] = useState<ProfileLinkDialogState | null>(null)
  const [collegeTrackFilter, setCollegeTrackFilter] = useState<'all' | 'traditional' | 'adult_ed'>('all')

  const fetchData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('No session found');
        return;
      }
      setSession({ user });
      
      // Fetch coach profile
      let amAdmin: boolean | null = null
      if (user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('first_name, last_name, role')
          .eq('id', user.id)
          .single();
        
        setCoachProfile(profileData);
        amAdmin = ((profileData as any)?.role === 'admin')
        setIsAdmin(!!amAdmin)
      }

      const isAdminNow = (amAdmin === null ? isAdmin : amAdmin)
      // Admin – All-coaches: use paged API; otherwise use existing list API
      let statList: any[] = []
      if (isAdminNow && !ctxLoading && !coachId) {
        // Admin All-coaches mode: single initial page-0 fetch with in-flight guard
        if (adminInitLoadingRef.current) return
        if (adminOffset > 0 && competitorsLengthRef.current > 0) return
        adminInitLoadingRef.current = true
        try {
          // Reset state before bootstrapping
          setCompetitors([])
          setAdminTotal(null)
          setAdminOffset(0)
          const firstLimit = 40
          const r = await fetch(`/api/competitors/paged?offset=0&limit=${firstLimit}`)
          if (r.ok) {
            const j = await r.json()
            const normalizedRows = (j.rows || []).map(decorateCompetitor)
            setCompetitors(normalizedRows)
            setAdminTotal(j.total || 0)
            setAdminOffset((j.rows || []).length)
            statList = normalizedRows
          } else {
            setCompetitors([])
            setAdminTotal(0)
            setAdminOffset(0)
            statList = []
          }
        } finally {
          adminInitLoadingRef.current = false
        }
      } else {
        // Coach or Admin acting-as: load full list and slice on client
        const competitorsResponse = await fetch('/api/competitors');
        if (!competitorsResponse.ok) {
          throw new Error('Failed to fetch competitors');
        }
        const competitorsData = await competitorsResponse.json();
        const transformedCompetitors = (competitorsData.competitors || []).map(decorateCompetitor);
        let scopedCompetitors = transformedCompetitors as any[]
        if (isAdminNow && !ctxLoading && coachId) {
          scopedCompetitors = scopedCompetitors.filter((c: any) => c.coach_id === coachId)
        }
        setCompetitors(scopedCompetitors as any)
        setAdminTotal(null)
        setAdminOffset(0)
        adminInitLoadingRef.current = false
        statList = scopedCompetitors as any[]
      }

      // Fetch teams for dropdown - also through API for admin access
      const teamsResponse = await fetch('/api/teams');
      if (!teamsResponse.ok) {
        throw new Error('Failed to fetch teams');
      }
      const teamsData = await teamsResponse.json();
      
      // Fetch team member counts separately
      const teamMemberCounts = new Map<string, number>();
      for (const team of teamsData.teams || []) {
        const { count } = await supabase
          .from('team_members')
          .select('*', { count: 'exact', head: true })
          .eq('team_id', team.id);
        teamMemberCounts.set(team.id, count || 0);
      }
      
      // Transform teams data to include member count
      // Admin coach filter for teams (client-side for Phase 1)
      const rawTeams: any[] = teamsData.teams || []
      const scopedTeams = (isAdminNow && !ctxLoading && coachId)
        ? rawTeams.filter((t: any) => t.coach_id === coachId)
        : rawTeams
      const transformedTeams = scopedTeams.map((team: any) => ({
        id: team.id,
        name: team.name,
        memberCount: teamMemberCounts.get(team.id) || 0
      }));
      
      setTeams(transformedTeams);

      // Stats: always reflect DB totals for current mode (coach/admin acting-as/admin all)
      if (isAdminNow) {
        const url = coachId ? `/api/admin/analytics?coach_id=${coachId}` : '/api/admin/analytics'
        try {
          const ar = await fetch(url)
          if (ar.ok) {
            const aj = await ar.json()
            const totalCompetitors = (aj?.totals?.competitorCount) ?? (statList?.length || 0)
            const totalTeams = (aj?.totals?.teamCount) ?? transformedTeams.length
            const pendingCompetitors = aj?.statusCounts?.pending ?? 0
            const legacyCompliance = aj?.statusCounts?.compliance ?? 0
            const profileCompetitors = (aj?.statusCounts?.profile ?? 0) + legacyCompliance
            const inTheGameNcCompetitors = aj?.statusCounts?.in_the_game_not_compliant ?? 0
            const activeCompetitors = aj?.statusCounts?.complete ?? 0
            setStats({
              totalCompetitors,
              totalTeams,
              activeCompetitors,
              pendingCompetitors,
              profileCompetitors,
              inTheGameNcCompetitors,
            })
          } else {
            // Fallback to client counts if analytics fails
            const totalCompetitors = statList.length;
            const activeCompetitors = statList.filter((c: any) => c.status === 'complete').length;
            const pendingCompetitors = statList.filter((c: any) => c.status === 'pending').length;
            const legacyCompliance = statList.filter((c: any) => c.status === 'compliance').length;
            const profileCompetitors = statList.filter((c: any) => c.status === 'profile').length + legacyCompliance;
            const inTheGameNcCompetitors = statList.filter((c: any) => c.status === 'in_the_game_not_compliant').length;
            setStats({
              totalCompetitors,
              totalTeams: transformedTeams.length,
              activeCompetitors,
              pendingCompetitors,
              profileCompetitors,
              inTheGameNcCompetitors
            });
          }
        } catch {
          const totalCompetitors = statList.length;
          const activeCompetitors = statList.filter((c: any) => c.status === 'complete').length;
          const pendingCompetitors = statList.filter((c: any) => c.status === 'pending').length;
          const legacyCompliance = statList.filter((c: any) => c.status === 'compliance').length;
          const profileCompetitors = statList.filter((c: any) => c.status === 'profile').length + legacyCompliance;
          const inTheGameNcCompetitors = statList.filter((c: any) => c.status === 'in_the_game_not_compliant').length;
          setStats({
            totalCompetitors,
            totalTeams: transformedTeams.length,
            activeCompetitors,
            pendingCompetitors,
            profileCompetitors,
            inTheGameNcCompetitors
          });
        }
      } else {
        // Coach: client list contains all rows; compute locally
        const totalCompetitors = statList.length;
        const activeCompetitors = statList.filter((c: any) => c.status === 'complete').length;
        const pendingCompetitors = statList.filter((c: any) => c.status === 'pending').length;
        const legacyCompliance = statList.filter((c: any) => c.status === 'compliance').length;
        const profileCompetitors = statList.filter((c: any) => c.status === 'profile').length + legacyCompliance;
        const inTheGameNcCompetitors = statList.filter((c: any) => c.status === 'in_the_game_not_compliant').length;
        setStats({
          totalCompetitors,
          totalTeams: transformedTeams.length,
          activeCompetitors,
          pendingCompetitors,
          profileCompetitors,
          inTheGameNcCompetitors
        });
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [ctxLoading, coachId, isAdmin, adminOffset])

  // Initial and context-based fetch
  useEffect(() => {
    if (!ctxLoading) fetchData();
  }, [ctxLoading, coachId, fetchData]);

  useEffect(() => {
    if (divisionFilter !== 'college' && collegeTrackFilter !== 'all') {
      setCollegeTrackFilter('all')
    }
  }, [divisionFilter, collegeTrackFilter])

  // Auth-driven refresh
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (!ctxLoading && (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED')) {
        fetchData();
      }
    });
    return () => subscription.unsubscribe();
  }, [ctxLoading, fetchData]);

  // Connect sidebar search to dashboard search
  useEffect(() => {
    const sidebarSearch = document.getElementById('sidebar-search') as HTMLInputElement;
    if (sidebarSearch) {
      const handleSidebarSearch = (e: Event) => {
        const target = e.target as HTMLInputElement;
        setSearchTerm(target.value);
      };
      
      sidebarSearch.addEventListener('input', handleSidebarSearch);
      return () => sidebarSearch.removeEventListener('input', handleSidebarSearch);
    }
  }, []);

  // Filter competitors (compute before scroll observers)
  const filteredCompetitors = competitors.filter(competitor => {
    const term = searchTerm.toLowerCase()
    const matchesSearch = competitor.first_name.toLowerCase().startsWith(term) ||
                         competitor.last_name.toLowerCase().startsWith(term);
    const matchesActiveFilter = showInactive || competitor.is_active;
    const matchesDivision = divisionFilter === 'all' || competitor.division === divisionFilter;
    const matchesTrack = divisionFilter !== 'college'
      || collegeTrackFilter === 'all'
      || ((competitor.program_track || 'traditional') === collegeTrackFilter);
    return matchesSearch && matchesActiveFilter && matchesDivision && matchesTrack;
  });

  // Derived counters for the pager indicator (always match DataTable input)
  const isAdminAll = isAdmin && !coachId
  const displayedCount = isAdminAll
    ? filteredCompetitors.length
    : Math.min(visibleCount, filteredCompetitors.length)
  const totalCount = (isAdminAll && adminTotal !== null)
    ? adminTotal
    : filteredCompetitors.length

  useEffect(() => {
    competitorIdSetRef.current = new Set(competitors.map((c) => c.id))
    competitorsLengthRef.current = competitors.length
  }, [competitors])

  useEffect(() => {
    if (ctxLoading) return
    if (isAdmin && !coachId) return

    const scheduleRefresh = () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current)
      realtimeDebounceRef.current = setTimeout(() => {
        realtimeDebounceRef.current = null
        void fetchData()
      }, 350)
    }

    const handleCompetitorChange = (payload: { new: any; old: any }) => {
      const row = (payload.new ?? payload.old) as any
      if (!row) return
      const targetCoachId = row.coach_id
      const scopedCoachId = (isAdmin && coachId) ? coachId : sessionCoachId
      if (!scopedCoachId) return
      if (targetCoachId !== scopedCoachId) return
      scheduleRefresh()
    }

    const handleAgreementChange = (payload: { new: any; old: any }) => {
      const row = (payload.new ?? payload.old) as any
      const competitorId = row?.competitor_id
      if (!competitorId) return
      if (!competitorIdSetRef.current.has(competitorId)) return
      scheduleRefresh()
    }

    const channel = supabase
      .channel('dashboard-competitors-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'competitors' }, handleCompetitorChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agreements' }, handleAgreementChange)
      .subscribe()

    return () => {
      if (realtimeDebounceRef.current) {
        clearTimeout(realtimeDebounceRef.current)
        realtimeDebounceRef.current = null
      }
      supabase.removeChannel(channel)
    }
  }, [ctxLoading, isAdmin, coachId, fetchData, sessionCoachId])

  // Coaches/Admin acting-as: show full list (no client paging). Admin All-coaches uses server paging.
  useEffect(() => {
    if (!(isAdmin && !coachId)) {
      setVisibleCount(filteredCompetitors.length)
    }
  }, [filteredCompetitors.length, isAdmin, coachId, divisionFilter, showInactive])

  // Helper: find the nearest scrollable ancestor
  const getScrollParent = (el: HTMLElement | null): HTMLElement | null => {
    let node: HTMLElement | null = el?.parentElement || null
    while (node) {
      const style = window.getComputedStyle(node)
      const oy = style.overflowY
      if (oy === 'auto' || oy === 'scroll') return node
      node = node.parentElement
    }
    return null
  }

  const fetchMoreAdmin = useCallback(async () => {
    if (adminLoadingRef.current) return
    adminLoadingRef.current = true
    setAdminLoading(true)
    try {
      const limit = 20
      const offset = adminOffset
      if (adminTotal !== null && offset >= adminTotal) return
      const r = await fetch(`/api/competitors/paged?offset=${offset}&limit=${limit}`)
      if (r.ok) {
        const j = await r.json()
        const rows = (j.rows || []).map(decorateCompetitor) as Competitor[]
        if (rows.length) {
          setCompetitors(prev => {
            const seen = new Set(prev.map(item => item.id))
            const uniqued = rows.filter(item => !seen.has(item.id))
            if (!uniqued.length) return prev
            return [...prev, ...uniqued]
          })
          const loaded = offset + rows.length
          setAdminOffset(loaded)
          setAdminTotal(j.total ?? adminTotal)
        } else if (j.total !== undefined && j.total !== null) {
          setAdminTotal(j.total)
        }
      }
    } finally {
      adminLoadingRef.current = false
      setAdminLoading(false)
    }
  }, [adminOffset, adminTotal])

  useEffect(() => {
    if (!isAdmin) {
      setCoachDirectory({})
      return
    }

    const loadCoaches = async () => {
      try {
        const res = await fetch('/api/users/coaches')
        if (!res.ok) return
        const data = await res.json()
        const map: Record<string, { name?: string | null; email?: string | null }> = {}
        for (const coach of data.coaches || []) {
          const name = coach.name || coach.full_name || [coach.first_name, coach.last_name].filter(Boolean).join(' ').trim()
          map[coach.id] = { name: name || null, email: coach.email || null }
        }
        setCoachDirectory(map)
      } catch (error) {
        console.error('Failed to load coach directory', error)
      }
    }

    loadCoaches()
  }, [isAdmin])

  // Infinite scroll: observe sentinel within the actual panel (admin All‑coaches only)
  useEffect(() => {
    if (!(isAdmin && !coachId)) return
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const rootEl = getScrollParent(sentinel)
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          if (isAdmin && !coachId) {
            // Admin all-coaches: fetch next page if available
            if (!adminLoading && adminTotal !== null && competitors.length < adminTotal) {
              void fetchMoreAdmin()
            }
          } else {
            setVisibleCount((prev) => Math.min(prev + 20, filteredCompetitors.length))
          }
        }
      }
    }, { root: rootEl || null, rootMargin: '300px', threshold: 0 })
    obs.observe(sentinel)
    return () => obs.disconnect()
  }, [filteredCompetitors.length, isAdmin, coachId, competitors.length, adminTotal, adminLoading, fetchMoreAdmin])

  // Fallback proximity check on same root (covers edge browsers) – admin All‑coaches only
  useEffect(() => {
    if (!(isAdmin && !coachId)) return
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const rootEl = getScrollParent(sentinel)
    const onScroll = () => {
      const total = filteredCompetitors.length
      if (isAdmin && !coachId) {
        if (adminTotal !== null && competitors.length < adminTotal) {
          const near = rootEl
            ? rootEl.scrollTop + rootEl.clientHeight >= rootEl.scrollHeight - 200
            : window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 200
          if (near && !adminLoading) void fetchMoreAdmin()
        }
      } else {
        if (visibleCount < total) {
          const near = rootEl
            ? rootEl.scrollTop + rootEl.clientHeight >= rootEl.scrollHeight - 200
            : window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 200
          if (near) setVisibleCount((prev) => Math.min(prev + 20, total))
        }
      }
    }
    const target: any = rootEl || window
    target.addEventListener('scroll', onScroll)
    target.addEventListener('resize', onScroll)
    onScroll()
    return () => { target.removeEventListener('scroll', onScroll); target.removeEventListener('resize', onScroll) }
  }, [filteredCompetitors.length, visibleCount, isAdmin, coachId, competitors.length, adminTotal, adminLoading, fetchMoreAdmin])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete':
        return 'bg-green-100 text-green-800';
      case 'in_the_game_not_compliant':
      case 'profile':
      case 'compliance':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleEdit = (competitorId: string) => {
    const competitor = competitors.find(c => c.id === competitorId);
    if (competitor) {
      setEditingCompetitor(competitor);
      setEditModalOpen(true);
    }
  };

  const handleRegenerateLink = async (competitorId: string): Promise<string | null> => {
    try {
      const response = await fetch(`/api/competitors/${competitorId}/regenerate-link`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to regenerate link');
      }

      const data = await response.json();
      
      // Refresh data to get updated token info
      fetchData();
      
      // Return the new profile update URL
      return data.profileUpdateUrl;
    } catch (error: any) {
      console.error('Error regenerating link:', error);
      alert('Failed to regenerate profile link: ' + error.message);
      return null;
    }
  };

  const handleProfileLinkPrepared = useCallback((details: {
    competitor: CompetitorType;
    profileUrl: string;
    recipients: string[];
    template: { subject: string; body: string };
    coachEmail?: string | null;
    coachName?: string | null;
  }) => {
    const fullName = `${details.competitor.first_name} ${details.competitor.last_name}`.trim();
    setProfileLinkDialog({
      competitorName: fullName || details.competitor.first_name || 'Competitor',
      recipients: details.recipients,
      profileUrl: details.profileUrl,
      template: details.template,
      coachEmail: details.coachEmail,
      coachName: details.coachName,
    });
  }, []);

  const handleCopy = useCallback(async (value: string, message = 'Copied to clipboard.') => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(message);
    } catch (error) {
      console.error('Clipboard write failed', error);
      window.prompt('Copy to clipboard:', value);
    }
  }, []);

  const composeEmail = useCallback(async (mode: 'mailto' | 'gmail' | 'outlook') => {
    if (!profileLinkDialog) return;
    if (!profileLinkDialog.recipients.length) return;
    const to = profileLinkDialog.recipients.join(',');
    const encodedSubject = encodeURIComponent(profileLinkDialog.template.subject);
    const encodedBody = encodeURIComponent(profileLinkDialog.template.body);
    let url = '';
    switch (mode) {
      case 'gmail':
        url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodedSubject}&body=${encodedBody}`;
        window.open(url, '_blank', 'noopener');
        break;
      case 'outlook': {
        if (!window.confirm('Make sure you have Outlook Web open and signed in, then click OK to continue.')) {
          return;
        }
        url = `https://outlook.office.com/mail/deeplink/compose?mailtoui=1&to=${encodeURIComponent(to)}&subject=${encodedSubject}&body=${encodedBody}`;
        window.open(url, '_blank', 'noopener');
        break;
      }
      case 'mailto':
        url = `mailto:${encodeURIComponent(to)}?subject=${encodedSubject}&body=${encodedBody}`;
        window.location.href = url;
        break;
    }
  }, [profileLinkDialog]);

  const handleRegister = async (competitorId: string) => {
    const competitor = competitors.find((c) => c.id === competitorId);
    if (!competitor) return;

    alert('Manual registration is disabled. Auto-onboarding runs when the profile is complete.');
  };

  const handleDisable = async (competitorId: string) => {
    try {
      const competitor = competitors.find(c => c.id === competitorId);
      if (!competitor) return;

      const newActiveState = !competitor.is_active;
      
      // Optimistic update
      setCompetitors(prev => prev.map(c => 
        c.id === competitorId 
          ? { ...c, is_active: newActiveState }
          : c
      ));

      // API call to update database
      const response = await fetch(`/api/competitors/${competitorId}/toggle-active`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newActiveState }),
      });

      if (!response.ok) {
        // Revert on error
        setCompetitors(prev => prev.map(c => 
          c.id === competitorId 
            ? { ...c, is_active: !newActiveState }
            : c
        ));
        throw new Error('Failed to update competitor status');
      }
    } catch (error: any) {
      console.error('Error toggling competitor status:', error);
      alert('Failed to update competitor status: ' + error.message);
    }
  };



  const assignTeam = async (competitorId: string, teamId: string | undefined) => {
    try {
      if (teamId) {
        const response = await fetch(`/api/teams/${teamId}/members/add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            competitor_id: competitorId,
          }),
        });

        if (response.ok) {
          // Refresh data to get updated team information
          fetchData();
        } else {
          const errorData = await response.json();
          alert('Failed to assign team: ' + errorData.error);
        }
      } else {
        // Remove from team
        const competitor = competitors.find(c => c.id === competitorId);
        if (competitor?.team_id) {
          const response = await fetch(`/api/teams/${competitor.team_id}/members/${competitorId}`, {
            method: 'DELETE',
          });

          if (response.ok) {
            // Refresh data to get updated team information
            fetchData();
          } else {
            alert('Failed to remove from team');
          }
        }
      }
      
      setOpenDropdown(null);
    } catch (error) {
      console.error('Error assigning team:', error);
      alert('Failed to assign team');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white-900">Competitors Dashboard</h1>
        <p className="text-gray-600 mt-2">
          Manage your competitors and track their progress
        </p>
      </div>

      {/* Stats Grid with Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-meta-card border-meta-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-meta-light">Total Competitors</CardTitle>
            {/* Add competitor (tooltip) */}
            <div title="Create new competitor">
              <CompetitorForm onSuccess={fetchData} variant="compact" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-meta-light">{stats.totalCompetitors}</div>
            <p className="text-xs text-meta-muted">
              All competitors in your program
            </p>
          </CardContent>
        </Card>

        {/* Status breakdown replaces the center two blocks */}
        <Card className="bg-meta-card border-meta-border md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-meta-light">Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-[11px] text-meta-muted mb-3 grid grid-cols-2 gap-y-1 gap-x-4">
              <div><span className="text-meta-light">Pending:</span> Waiting for profile update</div>
              <div><span className="text-meta-light">Profile:</span> Profile complete; onboarding in progress</div>
              <div><span className="text-meta-light">In The Game NC:</span> On the game platform; release incomplete</div>
              <div><span className="text-meta-light">In The Game:</span> On the game platform with completed release</div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-meta-dark rounded p-3">
                <div className="text-xs text-meta-muted">Pending</div>
                <div className="text-xl font-bold text-yellow-400">{stats.pendingCompetitors}</div>
              </div>
              <div className="bg-meta-dark rounded p-3">
                <div className="text-xs text-meta-muted">Profile</div>
                <div className="text-xl font-bold text-blue-400">{stats.profileCompetitors}</div>
              </div>
              <div className="bg-meta-dark rounded p-3">
                <div className="text-xs text-meta-muted">In The Game NC</div>
                <div className="text-xl font-bold text-blue-400">{stats.inTheGameNcCompetitors}</div>
              </div>
              <div className="bg-meta-dark rounded p-3">
                <div className="text-xs text-meta-muted">In The Game</div>
                <div className="text-xl font-bold text-green-400">{stats.activeCompetitors}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-meta-card border-meta-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-meta-light">Total Teams</CardTitle>
            <Link href="/dashboard/teams" title="Open team management">
              <Button size="sm" className="h-8 w-8 p-0 bg-meta-accent hover:bg-blue-600" aria-label="Open team management">
                <LogIn className="h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-meta-light">{stats.totalTeams}</div>
            <p className="text-xs text-meta-muted">
              Teams you&apos;ve created
            </p>
          </CardContent>
        </Card>
      </div>



      {/* Competitors List */}
      <Card className="bg-meta-card border-meta-border">
        <CardHeader>
          <CardTitle className="text-meta-light">
            All Competitors ({filteredCompetitors.length})
          </CardTitle>
          <CardDescription className="text-meta-muted">
            {competitors.length === 0 
              ? 'No competitors added yet. Add your first competitor to get started!'
              : 'View and manage all competitors in your program'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Controls */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-2 text-sm text-meta-light">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="rounded border-meta-border bg-meta-card text-meta-accent focus:ring-meta-accent"
                />
                <span>Show Inactive Competitors</span>
              </label>
              {/* Division filter as simple tabs */}
              {(() => {
                const base = (competitors || []).filter(c => (showInactive || c.is_active))
                const present = new Set(base.map(c => c.division).filter(Boolean) as string[])
                const count = (d?: string) => base.filter(c => (!d || c.division===d)).length
                const collegeOnly = base.filter(c => c.division === 'college')
                const trackCount = (t: 'traditional' | 'adult_ed') => collegeOnly.filter(c => (c.program_track || 'traditional') === t).length
                const order: Array<{value: any; label: string}> = [
                  { value: 'all', label: 'All (' + count() + ')' },
                  ...(present.has('middle_school') ? [{ value: 'middle_school', label: 'Middle (' + count('middle_school') + ')' }] : []),
                  ...(present.has('high_school') ? [{ value: 'high_school', label: 'High (' + count('high_school') + ')' }] : []),
                  ...(present.has('college') ? [{ value: 'college', label: 'College (' + count('college') + ')' }] : []),
                ]
                return (
                  <div className="flex items-center text-sm">
                    <span className="mr-2 text-meta-light">Division:</span>
                    <div className="flex rounded-md overflow-hidden border border-meta-border">
                      {order.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setDivisionFilter(opt.value as any)}
                          className={`px-3 py-1 ${divisionFilter === opt.value ? 'bg-meta-accent text-white' : 'bg-meta-card text-meta-light hover:bg-meta-dark'}`}
                          title={`Show ${opt.label} division`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {divisionFilter === 'college' && collegeOnly.length > 0 && (
                      <div className="flex items-center ml-4">
                        <span className="mr-2 text-meta-light">Track:</span>
                        <div className="flex rounded-md overflow-hidden border border-meta-border">
                          {[
                            { value: 'all', label: 'All (' + collegeOnly.length + ')' },
                            { value: 'traditional', label: 'Traditional (' + trackCount('traditional') + ')' },
                            { value: 'adult_ed', label: 'Adult Ed/Continuing Ed (' + trackCount('adult_ed') + ')' },
                          ].map(opt => (
                            <button
                              key={opt.value}
                              onClick={() => setCollegeTrackFilter(opt.value as 'all' | 'traditional' | 'adult_ed')}
                              className={`px-3 py-1 ${collegeTrackFilter === opt.value ? 'bg-amber-500 text-white' : 'bg-meta-card text-meta-light hover:bg-meta-dark'}`}
                              title={`Show ${opt.label}`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
            <div className="text-sm text-meta-muted">Showing {displayedCount} of {totalCount}</div>
          </div>

          {/* Data Table */}
          <DataTable
            columns={createCompetitorColumns(
              handleEdit,
              handleRegenerateLink,
              handleRegister,
              registeringId,
              handleDisable,
              assignTeam,
              teams,
              openDropdown,
              setOpenDropdown,
              handleProfileLinkPrepared,
              session?.user?.email,
              coachProfile ? `${coachProfile.first_name} ${coachProfile.last_name}` : session?.user?.email,
              coachDirectory,
              isAdmin && !ctxLoading && coachId === null,
              (isAdmin && !ctxLoading && coachId === null),
              'Select a coach to edit'
              )}
              data={filteredCompetitors}
          />
          {(isAdmin && !coachId) && <div ref={sentinelRef} className="h-1" />}
        </CardContent>
      </Card>

      {/* Edit Competitor Modal */}
      {editingCompetitor && (
        <CompetitorEditForm
          competitor={editingCompetitor}
          open={editModalOpen}
          onOpenChange={setEditModalOpen}
          onSuccess={() => {
            fetchData();
            setEditingCompetitor(null);
          }}
        />
      )}

      <Dialog
        open={!!profileLinkDialog}
        onOpenChange={(open) => {
          if (!open) setProfileLinkDialog(null)
        }}
      >
        {profileLinkDialog && (
          <DialogContent className="bg-meta-card border-meta-border text-meta-light w-full max-w-3xl sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>Share Profile Update Link</DialogTitle>
              <DialogDescription className="text-meta-muted">
                Send {profileLinkDialog.competitorName}&apos;s profile link using your preferred email client. Copy the text below or open a compose window directly.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-meta-light">Recipients</p>
                <p className="mt-1 text-sm text-meta-muted break-words break-all">
                  {profileLinkDialog.recipients.join(', ')}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-meta-light">Subject</p>
                <div className="mt-1 rounded border border-meta-border bg-meta-dark px-3 py-2 text-sm text-meta-light">
                  {profileLinkDialog.template.subject}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-meta-light">Message</p>
                <Textarea
                  value={profileLinkDialog.template.body}
                  readOnly
                  rows={8}
                  className="mt-1 bg-meta-dark border-meta-border text-meta-light"
                />
              </div>
              <div>
                <p className="text-sm font-medium text-meta-light">Profile Link</p>
                <div className="mt-1 rounded border border-meta-border bg-meta-dark px-3 py-2 text-sm text-foreground break-words break-all">
                  {profileLinkDialog.profileUrl}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => composeEmail('gmail')}>
                  Open Gmail
                </Button>
                <Button variant="outline" onClick={() => composeEmail('outlook')}>
                  Open Outlook Web
                </Button>
                <Button variant="outline" onClick={() => composeEmail('mailto')}>
                  Default Mail App
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  onClick={() => handleCopy(profileLinkDialog.template.subject, 'Subject copied to clipboard.')}
                  className="text-meta-light hover:text-meta-accent"
                >
                  <Copy className="mr-2 h-4 w-4" /> Copy Subject
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => handleCopy(profileLinkDialog.template.body, 'Email body copied to clipboard.')}
                  className="text-meta-light hover:text-meta-accent"
                >
                  <Copy className="mr-2 h-4 w-4" /> Copy Message
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => handleCopy(profileLinkDialog.profileUrl, 'Profile link copied to clipboard.')}
                  className="text-meta-light hover:text-meta-accent"
                >
                  <Copy className="mr-2 h-4 w-4" /> Copy Link
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>


    </div>
  );
}
