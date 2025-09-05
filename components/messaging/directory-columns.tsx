"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"

export type DirectoryRow = {
  id: string
  name: string
  email: string
  role?: string
}

export function createDirectoryColumns(
  onStartDM: (userId: string) => void
): ColumnDef<DirectoryRow, any>[] {
  return [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'email', header: 'Email' },
    { accessorKey: 'role', header: 'Role', cell: ({ row }) => <span className="text-xs text-meta-muted">{row.original.role}</span> },
    { id: 'actions', header: '', cell: ({ row }) => <div className="text-right"><Button size="sm" onClick={() => onStartDM(row.original.id)}>Start DM</Button></div> }
  ]
}

