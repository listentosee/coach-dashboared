'use client';
import ActingAsBanner from '@/components/admin/ActingAsBanner';
import { WblReportView } from '@/components/game-platform/wbl/wbl-report-view';

export default function WorkBasedLearningHoursPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-meta-light">Work Based Learning Hours</h1>
        <p className="text-sm text-slate-400">Estimated platform engagement time for your students, from challenge-solve activity and Flash CTF participation.</p>
        <ActingAsBanner />
      </div>
      <WblReportView />
    </div>
  );
}
