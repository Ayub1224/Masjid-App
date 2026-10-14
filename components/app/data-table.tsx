'use client';
import { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { SoftSelect } from './soft-select';
import { Button } from '@/components/ui/button';
import { ArrowUpDown, Search, ChevronLeft, ChevronRight } from 'lucide-react';
export function DataTable<T>({
  data,
  columns,
  searchLabel = 'Search records',
}: {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  searchLabel?: string;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [search, setSearch] = useState('');
  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter: search },
    onSortingChange: setSorting,
    onGlobalFilterChange: setSearch,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 6 } },
  });
  return (
    <div className="min-w-0 space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={searchLabel}
          placeholder={searchLabel}
          className="h-11 bg-card pl-10"
        />
      </div>
      <div className="space-y-4 sm:hidden">
        <SoftSelect label="Sort records" value={sorting[0] ? `${sorting[0].id}:${sorting[0].desc ? 'desc' : 'asc'}` : ''} onChange={(value) => { const [id, direction] = value.split(':'); setSorting(id ? [{ id, desc: direction === 'desc' }] : []); }} className="w-full">
          <option value="">Default order</option>
          {table.getAllLeafColumns().filter((column) => column.getCanSort()).flatMap((column) => ['asc', 'desc'].map((direction) => <option key={`${column.id}:${direction}`} value={`${column.id}:${direction}`}>{typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id} · {direction === 'asc' ? 'ascending' : 'descending'}</option>))}
        </SoftSelect>
        {table.getHeaderGroups().flatMap((group) => group.headers).filter((header) => header.column.id === 'select').map((header) => <div key={header.id} className="flex min-h-11 items-center gap-3 px-1">{flexRender(header.column.columnDef.header, header.getContext())}<span className="text-sm">Select matching records</span></div>)}
        {table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => <article key={row.id} className="neo-surface min-w-0 rounded-xl border bg-card p-4">
          <dl className="space-y-4">{row.getVisibleCells().map((cell) => <div key={cell.id} className="min-w-0 break-words [overflow-wrap:anywhere]">
            <dt className={cell.column.id === 'select' ? 'sr-only' : 'mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground'}>{typeof cell.column.columnDef.header === 'string' && cell.column.columnDef.header ? cell.column.columnDef.header : cell.column.id === 'select' ? 'Select record' : 'Actions'}</dt>
            <dd className="min-w-0 [&>div]:flex-wrap">{flexRender(cell.column.columnDef.cell, cell.getContext())}</dd>
          </div>)}</dl>
        </article>) : <p className="rounded-xl border bg-card px-4 py-8 text-center text-muted-foreground">No matching records.</p>}
      </div>
      <div className="hidden overflow-hidden rounded-xl border bg-card sm:block">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((g) => (
              <TableRow key={g.id}>
                {g.headers.map((h) => (
                  <TableHead
                    key={h.id}
                    className="px-4 py-3"
                    aria-sort={
                      h.column.getIsSorted() === 'asc'
                        ? 'ascending'
                        : h.column.getIsSorted() === 'desc'
                          ? 'descending'
                          : 'none'
                    }
                  >
                    {h.isPlaceholder ? null : h.column.getCanSort() ? (
                      <button
                        className="flex min-h-11 items-center gap-2 text-sm"
                        onClick={h.column.getToggleSortingHandler()}
                        aria-label={`Sort by ${String(h.column.columnDef.header)}`}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        <ArrowUpDown className="size-3.5" />
                      </button>
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((c) => (
                    <TableCell className="px-4 py-4" key={c.id}>
                      {flexRender(c.column.columnDef.cell, c.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="py-12 text-center text-muted-foreground"
                >
                  No matching records.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          {table.getFilteredRowModel().rows.length} records · Page{' '}
          {table.getState().pagination.pageIndex + 1} of{' '}
          {Math.max(table.getPageCount(), 1)}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="size-11"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Previous page"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            className="size-11"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Next page"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
