'use client';
import { Fragment } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { divisionLabel, type WblStudent } from '@/lib/integrations/game-platform/work-based-learning-hours';

const h = (m: number) => (Math.round((m / 60) * 10) / 10).toFixed(1);

export function WblDetailTable({ students }: { students: WblStudent[] }) {
  if (!students.length) {
    return <p className="text-sm text-slate-400">No students in this division for the selected period.</p>;
  }
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
          return (
            <Fragment key={s.competitorId}>
              {rows.map((r, i) => (
                <TableRow key={`${s.competitorId}-${i}`}>
                  <TableCell>{s.name}</TableCell>
                  <TableCell>{divisionLabel(s.division)}</TableCell>
                  <TableCell>{r.segment}</TableCell>
                  <TableCell>{r.activity}</TableCell>
                  <TableCell className="text-right">{r.solves}</TableCell>
                  <TableCell className="text-right">{r.sessions}</TableCell>
                  <TableCell className="text-right">{h(r.minutes)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-slate-800/60 font-semibold">
                <TableCell>{s.name}</TableCell>
                <TableCell>{divisionLabel(s.division)}</TableCell>
                <TableCell />
                <TableCell>{rows.length ? 'TOTAL — all activity' : 'TOTAL — all activity (no activity this period)'}</TableCell>
                <TableCell className="text-right">{rows.reduce((n, r) => n + r.solves, 0)}</TableCell>
                <TableCell />
                <TableCell className="text-right">{h(s.totalMinutes)}</TableCell>
              </TableRow>
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
