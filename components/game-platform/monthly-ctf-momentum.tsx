'use client';

import React, { useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronRight } from 'lucide-react';

interface ChallengeDetail {
  name: string;
  category: string;
  points: number;
  solvedAt: string;
}

interface CtfEvent {
  eventName: string;
  date: string;
  challenges: number;
  points: number;
  pointsPossible?: number | null;
  rank?: number | null;
  challengeDetails?: ChallengeDetail[];
}

interface Student {
  competitorId: string;
  name: string;
  totalCtfs: number;
  totalScore: number;
  events: CtfEvent[];
}

export interface CtfMomentumData {
  students: Student[];
}

interface Props {
  data: CtfMomentumData;
  onEventClick?: (competitorId: string, name: string, event: CtfEvent) => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString() : '0';
}

export default function MonthlyCtfMomentum({ data, onEventClick }: Props) {
  const [sortConfig, setSortConfig] = useState<{
    column: 'name' | 'ctfs' | 'score';
    direction: 'asc' | 'desc';
  }>({ column: 'score', direction: 'desc' });
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

  if (!data || !data.students || data.students.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-meta-muted">
        No Flash CTF data available
      </div>
    );
  }

  const sortedStudents = [...data.students].sort((a, b) => {
    const m = sortConfig.direction === 'asc' ? 1 : -1;
    switch (sortConfig.column) {
      case 'name':
        return m * a.name.localeCompare(b.name);
      case 'ctfs':
        return m * (a.totalCtfs - b.totalCtfs);
      case 'score':
        return m * (a.totalScore - b.totalScore);
      default:
        return 0;
    }
  });

  const handleSort = (column: typeof sortConfig.column) => {
    setSortConfig({
      column,
      direction: sortConfig.column === column && sortConfig.direction === 'asc' ? 'desc' : 'asc',
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
      <div className="flex-1 overflow-y-auto border border-meta-border/60 rounded min-h-0">
        <table className="w-full text-xs text-meta-light">
          <thead className="sticky top-0 bg-meta-card text-meta-muted border-b border-meta-border/60">
            <tr>
              <th
                className="text-left py-1.5 px-2 font-medium cursor-pointer hover:text-meta-accent select-none"
                onClick={() => handleSort('name')}
              >
                <div className="flex items-center gap-1">
                  Student
                  <SortIcon column="name" />
                </div>
              </th>
              <th
                className="text-center py-1.5 px-2 font-medium cursor-pointer hover:text-meta-accent select-none"
                onClick={() => handleSort('ctfs')}
              >
                <div className="flex items-center justify-center gap-1">
                  CTFs
                  <SortIcon column="ctfs" />
                </div>
              </th>
              <th
                className="text-right py-1.5 px-2 font-medium cursor-pointer hover:text-meta-accent select-none"
                onClick={() => handleSort('score')}
              >
                <div className="flex items-center justify-end gap-1">
                  Total Score
                  <SortIcon column="score" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-meta-border/40">
            {sortedStudents.map((student) => {
              const isExpanded = expandedRows.has(student.competitorId);

              return (
                <React.Fragment key={student.competitorId}>
                  <tr
                    className="hover:bg-meta-dark/40 cursor-pointer"
                    onClick={() => toggleRow(student.competitorId)}
                  >
                    <td className="py-1.5 px-2">
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="h-3 w-3 shrink-0" />
                        ) : (
                          <ChevronRight className="h-3 w-3 shrink-0" />
                        )}
                        <span className="truncate">{student.name}</span>
                      </div>
                    </td>
                    <td className="text-center py-1.5 px-2 font-medium">
                      {student.totalCtfs}
                    </td>
                    <td className="text-right py-1.5 px-2 font-medium">
                      {formatNumber(student.totalScore)}
                    </td>
                  </tr>
                  {isExpanded && student.events.length > 0 && (
                    <tr>
                      <td colSpan={3} className="bg-meta-dark/20 py-1 px-2">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-meta-muted">
                              <th className="text-left py-1 px-2 font-normal">Event</th>
                              <th className="text-center py-1 px-2 font-normal">Challenges</th>
                              <th className="text-right py-1 px-2 font-normal">Score</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-meta-border/20">
                            {student.events.map((event, idx) => (
                              <tr
                                key={`${student.competitorId}-${idx}`}
                                className="hover:bg-meta-dark/40 cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEventClick?.(student.competitorId, student.name, event);
                                }}
                              >
                                <td className="py-1 px-2">
                                  <div>
                                    <span className="text-meta-light">{event.eventName}</span>
                                    <span className="text-meta-muted ml-2 text-[10px]">
                                      {formatDate(event.date)}
                                    </span>
                                  </div>
                                </td>
                                <td className="text-center py-1 px-2 text-meta-light">
                                  {event.challenges}
                                </td>
                                <td className="text-right py-1 px-2 text-meta-light">
                                  {formatNumber(event.points)}
                                  {typeof event.pointsPossible === 'number' && (
                                    <span className="text-meta-muted"> / {formatNumber(event.pointsPossible)}</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
