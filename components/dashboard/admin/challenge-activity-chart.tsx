"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

export interface ChallengeActivityPoint {
  month: string;   // e.g. "Nov 2025"
  nonCtf: number;
  ctf: number;
}

export function ChallengeActivityChart({ data }: { data: ChallengeActivityPoint[] }) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
          <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              background: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: 8,
              color: '#e2e8f0',
            }}
          />
          <Legend wrapperStyle={{ color: '#e2e8f0', fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="nonCtf"
            name="Non-CTF solves"
            stroke="#38bdf8"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="ctf"
            name="CTF solves"
            stroke="#f472b6"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
