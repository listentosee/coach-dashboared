"use client"

import * as React from "react"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  initialSortId?: string
  initialSortDesc?: boolean
  onRowClick?: (row: TData) => void
  getRowClassName?: (row: TData) => string | undefined
  scrollContainerClassName?: string
  stickyHeader?: boolean
}

export function DataTable<TData, TValue>({
  columns,
  data,
  initialSortId,
  initialSortDesc,
  onRowClick,
  getRowClassName,
  scrollContainerClassName,
  stickyHeader,
}: DataTableProps<TData, TValue>) {
  // Determine a safe initial sort: prefer provided id, else 'first_name' if present, else none
  const columnIds = React.useMemo(() => columns.map(c => (c.id as string) || (c as any).accessorKey).filter(Boolean), [columns])
  const safeInitialId = React.useMemo(() => {
    if (initialSortId && columnIds.includes(initialSortId)) return initialSortId
    if (columnIds.includes('first_name')) return 'first_name'
    return undefined
  }, [initialSortId, columnIds])

  const [sorting, setSorting] = React.useState<SortingState>(
    safeInitialId ? [{ id: safeInitialId, desc: !!initialSortDesc }] : []
  )

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
  })

  const headerMarkup = (
    <TableHeader>
      {table.getHeaderGroups().map((headerGroup) => (
        <TableRow key={headerGroup.id}>
          {headerGroup.headers.map((header) => (
            <TableHead key={header.id}>
              {header.isPlaceholder
                ? null
                : flexRender(
                    header.column.columnDef.header,
                    header.getContext()
                  )}
            </TableHead>
          ))}
        </TableRow>
      ))}
    </TableHeader>
  )

  const bodyMarkup = (
    <TableBody>
      {table.getRowModel().rows?.length ? (
        table.getRowModel().rows.map((row) => (
          <TableRow
            key={row.id}
            className={getRowClassName ? (getRowClassName(row.original)) : ((row.original as any).is_active === false ? "opacity-50" : "")}
            onClick={() => onRowClick && onRowClick(row.original)}
            style={{ cursor: onRowClick ? 'pointer' : undefined }}
          >
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id}>
                {flexRender(
                  cell.column.columnDef.cell,
                  cell.getContext()
                )}
              </TableCell>
            ))}
          </TableRow>
        ))
      ) : (
        <TableRow>
          <TableCell
            colSpan={columns.length}
            className="h-24 text-center"
          >
            No results.
          </TableCell>
        </TableRow>
      )}
    </TableBody>
  )

  if (stickyHeader && scrollContainerClassName) {
    const visibleCols = table.getVisibleFlatColumns()
    const totalWidth = visibleCols.reduce((sum, col) => sum + col.getSize(), 0)
    const colGroup = (
      <colgroup>
        {visibleCols.map((col) => (
          <col key={col.id} style={{ width: `${col.getSize()}px` }} />
        ))}
      </colgroup>
    )
    return (
      <div className="w-full">
        <div className="rounded-md border">
          <div className={scrollContainerClassName}>
            <Table className="table-fixed" style={{ width: `${totalWidth}px`, minWidth: '100%' }}>
              {colGroup}
              <TableHeader className="sticky top-0 z-10 bg-meta-card">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} className="bg-meta-card">
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              {bodyMarkup}
            </Table>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="rounded-md border">
        {scrollContainerClassName ? (
          <div className={scrollContainerClassName}>
            <Table>{headerMarkup}{bodyMarkup}</Table>
          </div>
        ) : (
          <Table>{headerMarkup}{bodyMarkup}</Table>
        )}
      </div>
    </div>
  )
}
