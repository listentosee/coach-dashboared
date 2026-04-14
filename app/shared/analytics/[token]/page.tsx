import { redirect } from 'next/navigation';
import { DemographicCharts } from '@/components/dashboard/admin/demographic-charts';
import { SchoolDistributionMap } from '@/components/dashboard/admin/school-distribution-map';
import { buildSharedAnalyticsReport } from '@/lib/analytics/shared-report';
import {
  getAnalyticsShareLinkByToken,
  markAnalyticsShareLinkUsed,
  validateAnalyticsShareLink,
} from '@/lib/analytics/share-links';

export const dynamic = 'force-dynamic';

const numberFormatter = new Intl.NumberFormat('en-US');

type SharedAnalyticsPageProps = {
  params: Promise<{ token: string }>;
};

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function MetricBarList({
  rows,
  emptyMessage,
}: {
  rows: Array<{ label: string; value: number; secondary?: string }>;
  emptyMessage: string;
}) {
  if (!rows.length) {
    return (
      <div className="rounded border border-dashed border-meta-border/60 bg-meta-dark/30 p-6 text-sm text-meta-muted">
        {emptyMessage}
      </div>
    );
  }

  const maxValue = Math.max(...rows.map((row) => row.value), 1);

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const width = Math.max((row.value / maxValue) * 100, row.value > 0 ? 8 : 0);
        return (
          <div key={row.label} className="rounded border border-meta-border/50 bg-meta-dark/40 p-3">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-meta-light">{row.label}</div>
                {row.secondary ? <div className="text-xs text-meta-muted">{row.secondary}</div> : null}
              </div>
              <div className="text-lg font-semibold text-meta-light">{formatNumber(row.value)}</div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-meta-dark">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-sky-400 to-emerald-400"
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default async function SharedAnalyticsPage({ params }: SharedAnalyticsPageProps) {
  const { token } = await params;
  const link = await getAnalyticsShareLinkByToken(token);

  if (!link) {
    redirect('/404');
  }

  const validation = validateAnalyticsShareLink(link);
  if (!validation.valid) {
    return (
      <main className="min-h-screen bg-meta-dark px-4 py-10 text-meta-light">
        <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-white/5 p-8">
          <h1 className="text-3xl font-semibold">Shared Report Unavailable</h1>
          <p className="mt-3 text-sm text-slate-300">
            This shared analytics link is no longer available.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Reason: {validation.reason}
          </p>
        </div>
      </main>
    );
  }

  await markAnalyticsShareLinkUsed(link.id, link.use_count);
  const report = await buildSharedAnalyticsReport();

  return (
    <main className="min-h-screen bg-meta-dark text-meta-light">
      <div className="relative p-6">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            background:
              'radial-gradient(800px 400px at 20% -10%, #3b82f6, transparent), radial-gradient(700px 300px at 120% 50%, #10b981, transparent)',
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-10"
          style={{ background: 'linear-gradient(130deg, rgba(255,255,255,.06) 0%, rgba(255,255,255,0) 60%)' }}
        />

        <div className="relative mx-auto max-w-7xl space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-wide text-meta-light">Operations Analytics</h1>
            <p className="mt-2 text-meta-muted">
              Shared donor view of the live analytics dashboard, excluding admin-only controls and the coach table.
            </p>
            <p className="mt-2 text-xs text-slate-400">Generated {new Date(report.generatedAt).toLocaleString()}</p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {report.metrics.map((metric, index) => {
              const glows = [
                'from-blue-500/30 to-blue-300/5',
                'from-emerald-500/30 to-emerald-300/5',
                'from-fuchsia-500/30 to-fuchsia-300/5',
              ];
              return (
                <div key={metric.label} className="relative overflow-hidden rounded border border-meta-border bg-meta-card">
                  <div className={`absolute -inset-1 bg-gradient-to-br ${glows[index % glows.length]} blur-xl`} />
                  <div className="relative p-5">
                    <div className="text-sm text-meta-muted">{metric.label}</div>
                    <div className="text-4xl font-extrabold tracking-wider text-meta-light">
                      {formatNumber(metric.value)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded border border-meta-border bg-meta-card p-5">
            <div className="mb-4">
              <div className="text-sm text-meta-muted">School Locations</div>
              <div className="text-meta-light text-lg font-semibold">Geographic Distribution</div>
              <p className="mt-1 text-sm text-meta-muted">
                Uses stored school coordinates from coach profiles only. No live geocoding happens in analytics.
              </p>
            </div>
            <SchoolDistributionMap points={report.schoolMapPoints} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded border border-meta-border bg-meta-card p-5 lg:col-span-2">
              <div className="mb-4">
                <div className="text-sm text-meta-muted">Competitor Status</div>
                <div className="text-meta-light text-lg font-semibold">Distribution</div>
              </div>
              <div className="space-y-4">
                {[
                  { key: 'pending', label: 'Pending', color: 'bg-yellow-500' },
                  { key: 'profile', label: 'Profile', color: 'bg-blue-500' },
                  { key: 'in_the_game_not_compliant', label: 'In The Game NC', color: 'bg-blue-500' },
                  { key: 'complete', label: 'In The Game', color: 'bg-green-500' },
                ].map((row) => {
                  const value = report.statusCounts[row.key as keyof typeof report.statusCounts] || 0;
                  const total = report.metrics.find((metric) => metric.label === 'Competitors')?.value || 0;
                  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
                  return (
                    <div key={row.key} className="text-sm">
                      <div className="mb-1 flex items-center justify-between">
                        <div className="text-meta-light">{row.label}</div>
                        <div className="text-meta-muted">
                          {formatNumber(value)} • {pct}%
                        </div>
                      </div>
                      <div className="h-2 rounded bg-meta-dark">
                        <div className={`${row.color} h-2 rounded`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded border border-meta-border bg-meta-card p-5">
              <div className="mb-4">
                <div className="text-sm text-meta-muted">Release / Agreements</div>
                <div className="text-meta-light text-lg font-semibold">Pipeline</div>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-meta-muted">Not Started</span>
                  <span className="font-semibold text-meta-light">{formatNumber(report.releasePipeline.notStarted)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-meta-muted">Sent</span>
                  <span className="font-semibold text-meta-light">{formatNumber(report.releasePipeline.sent)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-meta-muted">Complete</span>
                  <span className="font-semibold text-meta-light">{formatNumber(report.releasePipeline.complete)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded border border-meta-border bg-meta-card p-5">
            <div className="mb-4">
              <div className="text-sm text-meta-muted">Division & College Track</div>
              <div className="text-meta-light text-lg font-semibold">Enrollment Mix</div>
            </div>
            <DemographicCharts charts={[report.divisionChart, report.countyChart]} columns={2} showPercentages />
          </div>

          <div className="rounded border border-meta-border bg-meta-card p-5">
            <div className="mb-4">
              <div className="text-sm text-meta-muted">Demographics</div>
              <div className="text-meta-light text-lg font-semibold">Competitor Breakdown</div>
              <p className="mt-1 text-sm text-meta-muted">
                Includes only competitors who are Profile or above.
              </p>
            </div>
            <DemographicCharts charts={report.demographicCharts} showPercentages />
          </div>

          <div className="rounded border border-meta-border bg-meta-card p-5">
            <div className="mb-4">
              <div className="text-sm text-meta-muted">Game Platform</div>
              <div className="text-meta-light text-lg font-semibold">Challenge & Activity Analytics</div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <div className="rounded border border-meta-border/50 bg-meta-dark/50 p-4">
                <div className="text-sm text-meta-muted">Total Challenges Solved</div>
                <div className="mt-2 text-4xl font-extrabold tracking-wider text-meta-light">
                  {formatNumber(report.totalChallengesSolved)}
                </div>
                <div className="mt-2 text-sm text-meta-muted">
                  Across {formatNumber(report.linkedPlatformCompetitors)} linked competitors in the current scope.
                </div>
              </div>

              <div className="rounded border border-meta-border/50 bg-meta-dark/50 p-4">
                <div className="text-sm text-meta-muted">Outside School Day Activity</div>
                <div className="mt-2 flex items-end gap-3">
                  <div className="text-4xl font-extrabold tracking-wider text-meta-light">
                    {formatNumber(report.activityCounts.outsideSchool)}
                  </div>
                  <div className="pb-1 text-sm text-meta-muted">{report.outsideSchoolPct}%</div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-meta-dark">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-500 via-amber-400 to-yellow-300"
                    style={{ width: `${report.outsideSchoolPct}%` }}
                  />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-meta-muted">
                  <div className="rounded border border-meta-border/40 bg-meta-card/40 p-2">
                    <div>Before 9am</div>
                    <div className="mt-1 text-sm font-semibold text-meta-light">
                      {formatNumber(report.activityCounts.weekdayBeforeSchool)}
                    </div>
                  </div>
                  <div className="rounded border border-meta-border/40 bg-meta-card/40 p-2">
                    <div>After 3pm</div>
                    <div className="mt-1 text-sm font-semibold text-meta-light">
                      {formatNumber(report.activityCounts.weekdayAfterSchool)}
                    </div>
                  </div>
                  <div className="rounded border border-meta-border/40 bg-meta-card/40 p-2">
                    <div>Weekend</div>
                    <div className="mt-1 text-sm font-semibold text-meta-light">
                      {formatNumber(report.activityCounts.weekend)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded border border-meta-border/50 bg-meta-dark/50 p-4">
                <div className="text-sm text-meta-muted">Flash CTF Participation</div>
                <div className="mt-2 text-4xl font-extrabold tracking-wider text-meta-light">
                  {formatNumber(report.flashParticipantCount)}
                </div>
                <div className="mt-2 text-sm text-meta-muted">
                  Unique competitors with at least one Flash CTF event in the current scope.
                </div>
                <div className="mt-3 text-sm text-meta-muted">
                  {formatNumber(report.flashEntryCount)} total event {report.flashEntryCount === 1 ? 'entry' : 'entries'}
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="rounded border border-meta-border/50 bg-meta-dark/30 p-4">
                <div className="mb-3">
                  <div className="text-sm text-meta-muted">Flash CTF</div>
                  <div className="text-base font-semibold text-meta-light">Participation by Division</div>
                </div>
                <MetricBarList
                  rows={report.ctfParticipationRows}
                  emptyMessage="No Flash CTF participation found for the current scope."
                />
              </div>

              <div className="rounded border border-meta-border/50 bg-meta-dark/30 p-4">
                <div className="mb-3">
                  <div className="text-sm text-meta-muted">Game Platform</div>
                  <div className="text-base font-semibold text-meta-light">Challenges Solved by Division</div>
                </div>
                <MetricBarList
                  rows={report.divisionChallengeRows}
                  emptyMessage="No linked game platform competitors found for the current scope."
                />
              </div>
            </div>

            <div className="mt-6 rounded border border-meta-border/50 bg-meta-dark/30 p-4">
              <div className="mb-3">
                <div className="text-sm text-meta-muted">Challenge Solves</div>
                <div className="text-base font-semibold text-meta-light">Topic Clustering</div>
                <p className="mt-1 text-sm text-meta-muted">
                  Categories are normalized from challenge metadata and grouped into the dominant topic clusters.
                </p>
              </div>
              <MetricBarList
                rows={report.topicClusterRows}
                emptyMessage="No challenge solve topics found for the current scope."
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
