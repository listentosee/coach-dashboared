import type { Buffer as NodeBuffer } from 'node:buffer';
import type { WblReport } from '@/lib/reports/work-based-learning-hours';
import { divisionLabel, segmentLabel } from '@/lib/integrations/game-platform/work-based-learning-hours';

const HEADER_FILL = 'FF1F3864';
const TOTAL_FILL = 'FFE7EEF8';
const h = (m: number) => Math.round((m / 60) * 10) / 10;

export async function buildWblWorkbook(report: WblReport): Promise<NodeBuffer> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Coach Dashboard';
  wb.created = new Date(report.generatedAt);

  const periodLabel = report.period.label;
  const dates = report.period.start
    ? `${report.period.start.slice(0, 10)} to ${report.period.end!.slice(0, 10)}`
    : 'All time';

  // ---- Summary by Student ----
  const sum = wb.addWorksheet('Summary by Student');
  sum.columns = [
    { header: 'Student', key: 'name', width: 26 },
    { header: 'Division', key: 'division', width: 14 },
    { header: 'ODL Hrs', key: 'odl', width: 15 },
    { header: 'Flash CTF Hrs', key: 'ctf', width: 15 },
    { header: 'Total Hrs', key: 'total', width: 12 },
  ];
  for (const s of report.students) {
    sum.addRow({ name: s.name, division: divisionLabel(s.division), odl: h(s.odlMinutes), ctf: h(s.ctfMinutes), total: h(s.totalMinutes) });
  }
  sum.addRow({
    name: 'TOTAL', division: '',
    odl: h(report.summary.odlMinutes), ctf: h(report.summary.ctfMinutes), total: h(report.summary.totalMinutes),
  });

  // ---- Detail (grouped, per-student TOTAL) ----
  const detail = wb.addWorksheet('Detail');
  detail.columns = [
    { header: 'Student', key: 'student', width: 24 },
    { header: 'Division', key: 'division', width: 13 },
    { header: 'Segment', key: 'segment', width: 12 },
    { header: 'Activity (challenge type / CTF event)', key: 'activity', width: 34 },
    { header: 'Solves', key: 'solves', width: 8 },
    { header: 'Sessions/Events', key: 'sessions', width: 15 },
    { header: 'Est. Minutes', key: 'minutes', width: 12 },
    { header: 'Est. Hours', key: 'hours', width: 10 },
  ];
  for (const s of report.students) {
    const rows = [...s.odl, ...s.ctf];
    for (const r of rows) {
      detail.addRow({ student: s.name, division: divisionLabel(s.division), segment: segmentLabel(r.segment), activity: r.activity, solves: r.solves, sessions: r.sessions, minutes: r.minutes, hours: h(r.minutes) });
    }
    const totalRow = detail.addRow({ student: s.name, division: divisionLabel(s.division), segment: '', activity: rows.length ? 'TOTAL — all activity' : 'TOTAL — all activity (no activity this period)', solves: s.odl.concat(s.ctf).reduce((n, r) => n + r.solves, 0), sessions: '', minutes: s.totalMinutes, hours: h(s.totalMinutes) });
    totalRow.font = { bold: true };
    totalRow.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FILL } }; });
  }

  // ---- Data (atomic + filter) ----
  const data = wb.addWorksheet('Data');
  data.columns = [
    { header: 'Student', key: 'student', width: 24 },
    { header: 'Division', key: 'division', width: 13 },
    { header: 'Segment', key: 'segment', width: 12 },
    { header: 'Activity', key: 'activity', width: 34 },
    { header: 'Solves', key: 'solves', width: 8 },
    { header: 'Sessions/Events', key: 'sessions', width: 15 },
    { header: 'Est. Minutes', key: 'minutes', width: 12 },
    { header: 'Est. Hours', key: 'hours', width: 10 },
  ];
  for (const s of report.students) {
    for (const r of [...s.odl, ...s.ctf]) {
      data.addRow({ student: s.name, division: divisionLabel(s.division), segment: segmentLabel(r.segment), activity: r.activity, solves: r.solves, sessions: r.sessions, minutes: r.minutes, hours: h(r.minutes) });
    }
  }
  data.autoFilter = { from: 'A1', to: 'H1' };

  // ---- Methodology (required — submission legitimacy) ----
  const m = wb.addWorksheet('Methodology');
  m.getColumn(1).width = 120;
  const p = report.params;
  const lines: Array<[string, boolean]> = [
    ['Work Based Learning Hours — Methodology & Notes', true],
    ['', false],
    [`Coach: ${report.coach?.name ?? ''}${report.coach?.school ? ' — ' + report.coach.school : ''}`, false],
    [`Period: ${periodLabel} (${dates})`, false],
    [`Generated: ${report.generatedAt.slice(0, 10)}`, false],
    ['Data source: Coach Dashboard game-platform records (challenge solves + Flash CTF events).', false],
    ['', false],
    ['Estimation method', true],
    [`ODL (On-Demand Learning) practice: for each challenge type, solves are ordered by time and split into sessions; a gap greater than ${p.gapMinutes} minutes starts a new session. A session with 2+ solves = (last - first) + ${p.tailMinutes} minutes; a lone solve = ${p.orphanMinutes} minutes.`, false],
    [`Flash CTF (events): a student credited the full event window if they solved 1 or more challenges in it — ${p.mayorsName} = ${p.ctfMayorsMinutes} minutes (3.5 h); every other (regular monthly) Flash CTF = ${p.ctfRegularMinutes} minutes (2 h). Events with 0 solves are excluded.`, false],
    ['Per-student total = sum of On-Demand type rows + Flash CTF event rows. Challenge-type labels normalize case/format variants (e.g., Recon → Reconnaissance, Webex → Web Exploitation).', false],
    ['', false],
    ['Caveats', true],
    ['This is an estimate: the platform records solve completion times, not start or idle time. Flash CTF windows are applied by rule (the platform does not record event end times). On-Demand sessions are computed per challenge type.', false],
  ];
  lines.forEach(([text, bold]) => {
    const row = m.addRow([text]);
    row.getCell(1).font = { bold, name: 'Calibri', size: bold ? 12 : 11 };
    row.getCell(1).alignment = { wrapText: true, vertical: 'top' };
  });

  // header styling for the three data sheets
  for (const ws of [sum, detail, data]) {
    ws.getRow(1).eachCell((c) => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }

  return (await wb.xlsx.writeBuffer()) as NodeBuffer;
}
