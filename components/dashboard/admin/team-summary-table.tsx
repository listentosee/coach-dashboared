"use client"

import { useMemo, useState } from 'react'
import { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

export interface TeamSummaryRow {
  team_id: string
  team_name: string
  division: string | null
  coach_name: string
  school_name: string
  active_students: number
  first_timers: number
  first_timers_with_experience_known: number
  total_challenge_points: number
}

const pointsFormatter = new Intl.NumberFormat('en-US')

const sortableHeader = (label: string, column: any) => (
  <Button
    variant="ghost"
    className="px-0 hover:bg-transparent"
    onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
  >
    {label}
    <ArrowUpDown className="ml-1 h-3 w-3" />
  </Button>
)

const columns: ColumnDef<TeamSummaryRow>[] = [
  {
    accessorKey: 'team_name',
    header: ({ column }) => sortableHeader('Team', column),
    size: 220,
    cell: ({ row }) => (
      <span className="font-medium text-meta-light">{row.original.team_name}</span>
    ),
  },
  {
    accessorKey: 'first_timers',
    header: ({ column }) => sortableHeader('First Timers', column),
    size: 150,
    cell: ({ row }) => {
      const r = row.original
      return (
        <span>
          {r.first_timers} / {r.active_students}
        </span>
      )
    },
  },
  {
    accessorKey: 'coach_name',
    header: ({ column }) => sortableHeader('Coach', column),
    size: 180,
    cell: ({ row }) => row.original.coach_name,
  },
  {
    accessorKey: 'school_name',
    header: ({ column }) => sortableHeader('School', column),
    size: 240,
    cell: ({ row }) => row.original.school_name,
  },
  {
    accessorKey: 'active_students',
    header: ({ column }) => sortableHeader('Active Students', column),
    size: 150,
    cell: ({ row }) => row.original.active_students,
  },
  {
    accessorKey: 'total_challenge_points',
    header: ({ column }) => sortableHeader('Total Points', column),
    size: 140,
    cell: ({ row }) => pointsFormatter.format(row.original.total_challenge_points),
  },
]

type DivisionKey = 'college' | 'high_school' | 'middle_school'

const divisionLabels: Record<DivisionKey, string> = {
  college: 'College',
  high_school: 'High School',
  middle_school: 'Middle School',
}

export function TeamSummaryTable({ data }: { data: TeamSummaryRow[] }) {
  const [division, setDivision] = useState<DivisionKey>('high_school')

  const filtered = useMemo(
    () => data.filter((row) => (row.division ?? '').toLowerCase() === division),
    [data, division],
  )

  return (
    <div className="space-y-4">
      <Tabs value={division} onValueChange={(v) => setDivision(v as DivisionKey)}>
        <TabsList>
          <TabsTrigger value="college">{divisionLabels.college}</TabsTrigger>
          <TabsTrigger value="high_school">{divisionLabels.high_school}</TabsTrigger>
          <TabsTrigger value="middle_school">{divisionLabels.middle_school}</TabsTrigger>
        </TabsList>
      </Tabs>
      <DataTable
        columns={columns}
        data={filtered}
        initialSortId="team_name"
        scrollContainerClassName="max-h-[600px] overflow-auto"
        stickyHeader
      />
    </div>
  )
}
