'use client';
import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { divisionLabel, segmentLabel, type WblStudent } from '@/lib/integrations/game-platform/work-based-learning-hours';

const h = (m: number) => (Math.round((m / 60) * 10) / 10).toFixed(1);

// Tight vertical padding (overrides the default roomy p-4 on TableCell).
const TOTAL_CELL = 'py-2';
const DETAIL_CELL = 'py-1';

export function WblDetailTable({ students }: { students: WblStudent[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (!students.length) {
    return <p className="text-sm text-slate-400">No students in this division for the selected period.</p>;
  }

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Student</TableHead>
          <TableHead>Division</TableHead>
          <TableHead>Segment</TableHead>
          <TableHead>Activity (challenge type / CTF event)</TableHead>
          <TableHead className="text-right">Solves</TableHead>
          <TableHead className="text-right">Sessions/Events</TableHead>
          <TableHead className="text-right">Est. Hours</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {students.map((s) => {
          const rows = [...s.odl, ...s.ctf];
          const hasActivity = rows.length > 0;
          const isOpen = expanded.has(s.competitorId);
          return (
            <Fragment key={s.competitorId}>
              {/* Student total row — click to expand the detail below */}
              <TableRow
                className={`bg-slate-800/50 font-semibold ${hasActivity ? 'cursor-pointer hover:bg-slate-800/70' : ''}`}
                onClick={hasActivity ? () => toggle(s.competitorId) : undefined}
                role={hasActivity ? 'button' : undefined}
                tabIndex={hasActivity ? 0 : undefined}
                aria-expanded={hasActivity ? isOpen : undefined}
                onKeyDown={
                  hasActivity
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggle(s.competitorId);
                        }
                      }
                    : undefined
                }
              >
                <TableCell className={TOTAL_CELL}>
                  <span className="inline-flex items-center gap-1.5">
                    {hasActivity ? (
                      isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />
                    ) : (
                      <span className="inline-block w-4 shrink-0" />
                    )}
                    {s.name}
                  </span>
                </TableCell>
                <TableCell className={TOTAL_CELL}>{divisionLabel(s.division)}</TableCell>
                <TableCell className={TOTAL_CELL} />
                <TableCell className={`${TOTAL_CELL} text-slate-400`}>
                  {hasActivity
                    ? `Total — all activity (${rows.length} ${rows.length === 1 ? 'item' : 'items'})`
                    : 'No activity this period'}
                </TableCell>
                <TableCell className={`${TOTAL_CELL} text-right`}>{rows.reduce((n, r) => n + r.solves, 0)}</TableCell>
                <TableCell className={TOTAL_CELL} />
                <TableCell className={`${TOTAL_CELL} text-right`}>{h(s.totalMinutes)}</TableCell>
              </TableRow>

              {/* Collapsible detail rows (tight) */}
              {isOpen &&
                rows.map((r, i) => (
                  <TableRow key={`${s.competitorId}-${i}`} className="bg-slate-900/40">
                    <TableCell className={DETAIL_CELL} />
                    <TableCell className={DETAIL_CELL} />
                    <TableCell className={`${DETAIL_CELL} pl-6 text-slate-300`}>{segmentLabel(r.segment)}</TableCell>
                    <TableCell className={`${DETAIL_CELL} text-slate-300`}>{r.activity}</TableCell>
                    <TableCell className={`${DETAIL_CELL} text-right text-slate-300`}>{r.solves}</TableCell>
                    <TableCell className={`${DETAIL_CELL} text-right text-slate-300`}>{r.sessions}</TableCell>
                    <TableCell className={`${DETAIL_CELL} text-right text-slate-300`}>{h(r.minutes)}</TableCell>
                  </TableRow>
                ))}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
