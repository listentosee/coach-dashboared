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

type SharedAnalyticsPageProps = {
  params: Promise<{ token: string }>;
};

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
    <main className="min-h-screen bg-meta-dark px-4 py-10 text-meta-light">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8">
          <h1 className="text-3xl font-semibold">Mayors Cyber Cup Impact Snapshot</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-300">
            This donor-safe shared view highlights participation, school reach, and demographic mix without exposing admin controls or personal contact information.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Generated {new Date(report.generatedAt).toLocaleString()}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
          {report.metrics.map((metric) => (
            <div key={metric.label} className="rounded-xl border border-white/10 bg-white/5 p-5">
              <div className="text-sm text-slate-400">{metric.label}</div>
              <div className="mt-2 text-4xl font-bold text-white">{metric.value.toLocaleString()}</div>
              {metric.secondary ? <div className="mt-1 text-xs text-slate-500">{metric.secondary}</div> : null}
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4">
            <div className="text-sm text-slate-400">School Locations</div>
            <div className="text-xl font-semibold text-white">Geographic Distribution</div>
          </div>
          <SchoolDistributionMap points={report.schoolMapPoints} />
        </div>

        <DemographicCharts charts={[report.divisionChart]} columns={1} />
        <DemographicCharts charts={report.demographicCharts} />
      </div>
    </main>
  );
}
