"use client"

import { useRouter } from 'next/navigation'
import { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface CoachSummaryRow {
  coach_id: string
  coach_name: string
  total_competitors: number
  pending: number
  in_game_compliant: number
  in_game_non_compliant: number
  in_teams: number
  not_in_team: number
  active_in_game_platform: number
  total_teams: number
  teams_without_image: number
}

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

const columns: ColumnDef<CoachSummaryRow>[] = [
  {
    accessorKey: 'coach_name',
    header: ({ column }) => sortableHeader('Coach', column),
    size: 200,
    cell: ({ row }) => (
      <span className="font-medium text-meta-light">{row.original.coach_name}</span>
    ),
  },
  {
    accessorKey: 'total_competitors',
    header: ({ column }) => sortableHeader('Competitors', column),
    cell: ({ row }) => row.original.total_competitors,
  },
  {
    accessorKey: 'pending',
    header: ({ column }) => sortableHeader('Pending', column),
    cell: ({ row }) => row.original.pending,
  },
  {
    accessorKey: 'in_game_compliant',
    header: ({ column }) => sortableHeader('In Game', column),
    cell: ({ row }) => row.original.in_game_compliant,
  },
  {
    accessorKey: 'in_game_non_compliant',
    header: ({ column }) => sortableHeader('In Game NC', column),
    cell: ({ row }) => row.original.in_game_non_compliant,
  },
  {
    accessorKey: 'in_teams',
    header: ({ column }) => sortableHeader('In Teams', column),
    cell: ({ row }) => row.original.in_teams,
  },
  {
    accessorKey: 'not_in_team',
    header: ({ column }) => sortableHeader('No Team', column),
    cell: ({ row }) => row.original.not_in_team,
  },
  {
    accessorKey: 'active_in_game_platform',
    header: ({ column }) => sortableHeader('Active GP', column),
    cell: ({ row }) => row.original.active_in_game_platform,
  },
  {
    accessorKey: 'total_teams',
    header: ({ column }) => sortableHeader('Teams', column),
    cell: ({ row }) => row.original.total_teams,
  },
  {
    accessorKey: 'teams_without_image',
    header: ({ column }) => sortableHeader('No Image', column),
    cell: ({ row }) => (
      <span className={row.original.teams_without_image > 0 ? 'text-yellow-400' : ''}>
        {row.original.teams_without_image}
      </span>
    ),
  },
]

export function CoachSummaryTable({ data }: { data: CoachSummaryRow[] }) {
  const router = useRouter()

  const handleRowClick = async (row: CoachSummaryRow) => {
    await fetch('/api/admin/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coach_id: row.coach_id }),
    })
    window.dispatchEvent(new Event('admin-context-changed'))
    router.push('/dashboard')
  }

  return (
    <DataTable
      columns={columns}
      data={data}
      initialSortId="coach_name"
      onRowClick={handleRowClick}
      scrollContainerClassName="max-h-[600px] overflow-auto"
      stickyHeader
    />
  )
}
