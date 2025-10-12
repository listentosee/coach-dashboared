'use client';

import { useState, useMemo, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

interface Challenge {
  id: string;
  solvedAt: string;
  title: string;
  category: string;
  source: string;
  points: number;
  nistRoles: string[];
}

interface Props {
  challenges: Challenge[];
}

interface WorkRole {
  work_role_id: string;
  title: string;
  category: string;
}

type SortField = 'solvedAt' | 'points' | 'title' | 'category';
type SortDirection = 'asc' | 'desc';

export default function ChallengesTable({ challenges }: Props) {
  const supabase = createClientComponentClient();
  const [sortField, setSortField] = useState<SortField>('solvedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [workRolesMap, setWorkRolesMap] = useState<Record<string, WorkRole>>({});

  // Get all unique NIST role IDs from challenges
  const allNistRoleIds = useMemo(() => {
    const ids = new Set<string>();
    challenges.forEach(c => c.nistRoles.forEach(roleId => ids.add(roleId)));
    return Array.from(ids);
  }, [challenges]);

  // Fetch work role details from reference table
  useEffect(() => {
    if (allNistRoleIds.length === 0) return;

    async function fetchWorkRoles() {
      const { data } = await supabase
        .from('nice_framework_work_roles')
        .select('work_role_id, title, category')
        .in('work_role_id', allNistRoleIds);

      if (data) {
        const map: Record<string, WorkRole> = {};
        data.forEach(role => {
          map[role.work_role_id] = role;
        });
        setWorkRolesMap(map);
      }
    }

    fetchWorkRoles();
  }, [allNistRoleIds, supabase]);

  // Get unique categories and sources
  const categories = useMemo(() => {
    const cats = new Set(challenges.map(c => c.category));
    return ['all', ...Array.from(cats).sort()];
  }, [challenges]);

  const sources = useMemo(() => {
    const srcs = new Set(challenges.map(c => c.source));
    return ['all', ...Array.from(srcs).sort()];
  }, [challenges]);

  // Filter and sort challenges
  const filteredAndSorted = useMemo(() => {
    let filtered = challenges;

    if (categoryFilter !== 'all') {
      filtered = filtered.filter(c => c.category === categoryFilter);
    }

    if (sourceFilter !== 'all') {
      filtered = filtered.filter(c => c.source === sourceFilter);
    }

    return filtered.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (sortField === 'solvedAt') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }

      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  }, [challenges, sortField, sortDirection, categoryFilter, sourceFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredAndSorted.length / itemsPerPage);
  const paginatedChallenges = filteredAndSorted.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setCurrentPage(1);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-2 h-4 w-4" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="ml-2 h-4 w-4" />
    ) : (
      <ArrowDown className="ml-2 h-4 w-4" />
    );
  };

  return (
    <div className="border rounded-lg">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Challenge History</h3>
          <div className="text-sm text-muted-foreground">
            Showing {filteredAndSorted.length} challenge{filteredAndSorted.length !== 1 ? 's' : ''}
          </div>
        </div>

        <div className="flex gap-4">
          <div className="w-48">
            <Select value={categoryFilter} onValueChange={(val) => { setCategoryFilter(val); setCurrentPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>
                    {cat === 'all' ? 'All Categories' : cat.replace('_', ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-48">
            <Select value={sourceFilter} onValueChange={(val) => { setSourceFilter(val); setCurrentPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by source" />
              </SelectTrigger>
              <SelectContent>
                {sources.map(src => (
                  <SelectItem key={src} value={src}>
                    {src === 'all' ? 'All Sources' : src}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort('solvedAt')}
                className="hover:bg-transparent"
              >
                Date
                <SortIcon field="solvedAt" />
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort('title')}
                className="hover:bg-transparent"
              >
                Challenge
                <SortIcon field="title" />
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort('category')}
                className="hover:bg-transparent"
              >
                Category
                <SortIcon field="category" />
              </Button>
            </TableHead>
            <TableHead>Source</TableHead>
            <TableHead className="text-right">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort('points')}
                className="hover:bg-transparent"
              >
                Points
                <SortIcon field="points" />
              </Button>
            </TableHead>
            <TableHead>NIST Roles</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedChallenges.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                No challenges found
              </TableCell>
            </TableRow>
          ) : (
            paginatedChallenges.map((challenge) => (
              <TableRow key={challenge.id}>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(challenge.solvedAt), { addSuffix: true })}
                </TableCell>
                <TableCell className="font-medium max-w-xs truncate">
                  {challenge.title}
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                    {challenge.category.replace('_', ' ')}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-sm">{challenge.source}</span>
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {challenge.points}
                </TableCell>
                <TableCell>
                  {challenge.nistRoles.length > 0 ? (
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {challenge.nistRoles.slice(0, 2).map(roleId => {
                        const role = workRolesMap[roleId];
                        return (
                          <span
                            key={roleId}
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-700"
                            title={role?.work_role_id || roleId}
                          >
                            {role?.title || roleId}
                          </span>
                        );
                      })}
                      {challenge.nistRoles.length > 2 && (
                        <span className="text-xs text-muted-foreground">
                          +{challenge.nistRoles.length - 2}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between p-4 border-t">
          <div className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}