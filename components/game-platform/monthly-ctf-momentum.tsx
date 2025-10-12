'use client';

import React, { useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronRight } from 'lucide-react';

interface Student {
  competitorId: string;
  name: string;
  thisMonthEvents: number;
  last3MonthsAvg: number;
  totalEvents12mo: number;
  challengesSolved: number;
  lastParticipated: string | null;
  status: 'none' | 'declining' | 'active';
}

interface MonthlyTotal {
  month: string;
  participants: number;
}

interface CtfEvent {
  eventName: string;
  date: string;
  challenges: number;
  points: number;
  challengeDetails?: Array<{ name: string; category: string; points: number; solvedAt: string }>;
}

interface CtfMomentumData {
  students: Student[];
  alerts: {
    noParticipation: number;
    declining: number;
  };
  monthlyTotals: MonthlyTotal[];
  eventsByCompetitor?: Record<string, CtfEvent[]>;
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}yr ago`;
}

interface Props {
  view: 'score' | 'pace';
  data: CtfMomentumData;
  onStudentClick?: (competitorId: string, name: string, eventName?: string) => void;
}

export default function MonthlyCtfMomentum({ view, data, onStudentClick }: Props) {
  const [sortConfig, setSortConfig] = useState<{
    column: 'name' | 'thisMonth' | 'avg3mo' | 'total' | 'last';
    direction: 'asc' | 'desc';
  }>({ column: 'name', direction: 'asc' });
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (competitorId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(competitorId)) {
        next.delete(competitorId);
      } else {
        next.add(competitorId);
      }
      return next;
    });
  };

  if (!data || !data.students) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-meta-muted">
        No Flash CTF data available
      </div>
    );
  }

  const statusColors = {
    none: 'bg-red-500',
    declining: 'bg-yellow-500',
    active: 'bg-green-500',
  };

  const maxParticipants = Math.max(...data.monthlyTotals.map(m => m.participants), 1);

  const sortedStudents = [...data.students].sort((a, b) => {
    const multiplier = sortConfig.direction === 'asc' ? 1 : -1;
    switch (sortConfig.column) {
      case 'name':
        return multiplier * a.name.localeCompare(b.name);
      case 'thisMonth':
        return multiplier * (a.thisMonthEvents - b.thisMonthEvents);
      case 'avg3mo':
        return multiplier * (a.last3MonthsAvg - b.last3MonthsAvg);
      case 'total':
        return multiplier * (a.totalEvents12mo - b.totalEvents12mo);
      case 'last':
        if (!a.lastParticipated && !b.lastParticipated) return 0;
        if (!a.lastParticipated) return multiplier * 1;
        if (!b.lastParticipated) return multiplier * -1;
        return multiplier * (new Date(a.lastParticipated).getTime() - new Date(b.lastParticipated).getTime());
      default:
        return 0;
    }
  });

  const handleSort = (column: typeof sortConfig.column) => {
    setSortConfig({
      column,
      direction: sortConfig.column === column && sortConfig.direction === 'asc' ? 'desc' : 'asc'
    });
  };

  const SortIcon = ({ column }: { column: typeof sortConfig.column }) => {
    if (sortConfig.column === column) {
      return sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
    }
    return <ArrowUpDown className="h-3 w-3 opacity-50" />;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Score View - Student Table with Alerts at top */}
      {view === 'score' && (
        <div className="h-full flex flex-col">
          {/* Alerts */}
          {(data.alerts.noParticipation > 0 || data.alerts.declining > 0) && (
            <div className="text-xs text-meta-muted space-y-1 mb-3">
              {data.alerts.noParticipation > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span>{data.alerts.noParticipation} student{data.alerts.noParticipation !== 1 ? 's' : ''} with no participation</span>
                </div>
              )}
              {data.alerts.declining > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-yellow-500" />
                  <span>{data.alerts.declining} student{data.alerts.declining !== 1 ? 's' : ''} declining</span>
                </div>
              )}
            </div>
          )}

          {/* Table - scrollable, fills remaining space */}
          <div className="flex-1 overflow-y-auto border border-meta-border/60 rounded min-h-0">
          <table className="w-full text-xs text-meta-light">
            <thead className="sticky top-0 bg-meta-card text-meta-muted border-b border-meta-border/60">
              <tr>
                <th
                  className="text-left py-1 px-2 font-medium cursor-pointer hover:text-meta-accent select-none"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-1">
                    Student
                    <SortIcon column="name" />
                  </div>
                </th>
                <th
                  className="text-center py-1 px-2 font-medium cursor-pointer hover:text-meta-accent select-none"
                  onClick={() => handleSort('thisMonth')}
                >
                  <div className="flex items-center justify-center gap-1">
                    This Mo
                    <SortIcon column="thisMonth" />
                  </div>
                </th>
                <th
                  className="text-center py-1 px-2 font-medium cursor-pointer hover:text-meta-accent select-none"
                  onClick={() => handleSort('avg3mo')}
                >
                  <div className="flex items-center justify-center gap-1">
                    3Mo Avg
                    <SortIcon column="avg3mo" />
                  </div>
                </th>
                <th
                  className="text-center py-1 px-2 font-medium cursor-pointer hover:text-meta-accent select-none"
                  onClick={() => handleSort('total')}
                >
                  <div className="flex items-center justify-center gap-1">
                    Total
                    <SortIcon column="total" />
                  </div>
                </th>
                <th
                  className="text-right py-1 px-2 font-medium cursor-pointer hover:text-meta-accent select-none"
                  onClick={() => handleSort('last')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Last
                    <SortIcon column="last" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-meta-border/40">
              {sortedStudents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-4 text-meta-muted">
                    No Flash CTF participation data
                  </td>
                </tr>
              ) : (
                sortedStudents.map((student) => {
                  const isExpanded = expandedRows.has(student.competitorId);
                  const studentEvents = data.eventsByCompetitor?.[student.competitorId] || [];

                  return (
                    <React.Fragment key={student.competitorId}>
                      <tr
                        className="hover:bg-meta-dark/40"
                        title={`${student.challengesSolved} challenges solved`}
                      >
                        <td className="py-1.5 px-2">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleRow(student.competitorId);
                              }}
                              className="hover:text-meta-accent"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-3 w-3" />
                              ) : (
                                <ChevronRight className="h-3 w-3" />
                              )}
                            </button>
                            <div className={`w-1.5 h-1.5 rounded-full ${statusColors[student.status]}`} />
                            <span className="truncate">{student.name}</span>
                          </div>
                        </td>
                        <td className="text-center py-1.5 px-2 font-medium">
                          {student.thisMonthEvents}
                        </td>
                        <td className="text-center py-1.5 px-2 text-meta-muted">
                          {student.last3MonthsAvg.toFixed(1)}
                        </td>
                        <td className="text-center py-1.5 px-2 text-meta-muted">
                          {student.totalEvents12mo}
                        </td>
                        <td className="text-right py-1.5 px-2 text-meta-muted text-[10px]">
                          {formatDate(student.lastParticipated)}
                        </td>
                      </tr>
                      {isExpanded && studentEvents.length > 0 && (
                        <tr>
                          <td colSpan={5} className="bg-meta-dark/20 py-2 px-8">
                            <div className="space-y-1">
                              {studentEvents.map((event, idx) => (
                                <button
                                  key={event.eventId ?? `${student.competitorId}-${idx}`}
                                  onClick={() => onStudentClick?.(student.competitorId, student.name, event.eventName)}
                                  className="block w-full text-left text-xs hover:text-meta-accent transition-colors"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium">{event.eventName}</span>
                                    <span className="text-meta-muted text-[10px]">
                                      {formatDate(event.date)} • {event.challenges} challenges • {event.points} pts
                                    </span>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Pace View - Monthly Participation Chart */}
      {view === 'pace' && (
        <div className="h-full flex flex-col">
          {/* Alerts */}
          {(data.alerts.noParticipation > 0 || data.alerts.declining > 0) && (
            <div className="text-xs text-meta-muted space-y-1 mb-3">
              {data.alerts.noParticipation > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span>{data.alerts.noParticipation} student{data.alerts.noParticipation !== 1 ? 's' : ''} with no participation</span>
                </div>
              )}
              {data.alerts.declining > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-yellow-500" />
                  <span>{data.alerts.declining} student{data.alerts.declining !== 1 ? 's' : ''} declining</span>
                </div>
              )}
            </div>
          )}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="text-xs text-meta-muted mb-2">
            Students participating per month (last 12 months)
          </div>
          <div className="flex-1 relative overflow-hidden">
            <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" preserveAspectRatio="none">
              {/* Grid lines */}
              {[0, 25, 50, 75, 100].map(y => (
                <line
                  key={y}
                  x1="0"
                  y1={y}
                  x2="100"
                  y2={y}
                  stroke="rgba(148, 163, 184, 0.1)"
                  strokeWidth="0.5"
                />
              ))}

              {/* Area chart */}
              {data.monthlyTotals.length > 0 && (
                <>
                  <polyline
                    points={data.monthlyTotals
                      .map((m, idx) => {
                        const x = (idx / (data.monthlyTotals.length - 1)) * 100;
                        const y = 100 - (m.participants / maxParticipants) * 100;
                        return `${x},${y}`;
                      })
                      .join(' ')}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                  <polygon
                    points={`
                      ${data.monthlyTotals
                        .map((m, idx) => {
                          const x = (idx / (data.monthlyTotals.length - 1)) * 100;
                          const y = 100 - (m.participants / maxParticipants) * 100;
                          return `${x},${y}`;
                        })
                        .join(' ')}
                      100,100 0,100
                    `}
                    fill="rgba(59, 130, 246, 0.2)"
                  />
                </>
              )}
            </svg>

            {/* Y-axis labels */}
            <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-[10px] text-meta-muted pr-2">
              <span>{maxParticipants}</span>
              <span>{Math.round(maxParticipants / 2)}</span>
              <span>0</span>
            </div>
          </div>

          {/* X-axis labels */}
          <div className="flex justify-between mt-2 text-[10px] text-meta-muted px-2">
            {data.monthlyTotals.length > 0 && (
              <>
                <span>{new Date(data.monthlyTotals[0].month + '-01').toLocaleDateString('en', { month: 'short' })}</span>
                <span>{new Date(data.monthlyTotals[Math.floor(data.monthlyTotals.length / 2)].month + '-01').toLocaleDateString('en', { month: 'short' })}</span>
                <span>{new Date(data.monthlyTotals[data.monthlyTotals.length - 1].month + '-01').toLocaleDateString('en', { month: 'short' })}</span>
              </>
            )}
          </div>
        </div>
        </div>
      )}
    </div>
  );
}
