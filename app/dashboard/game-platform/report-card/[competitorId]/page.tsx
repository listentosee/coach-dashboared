import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import ReportCardContent from '@/components/game-platform/report-card/report-card-content';

export default async function ReportCardPage({
  params,
}: {
  params: Promise<{ competitorId: string }>;
}) {
  const { competitorId } = await params;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Suspense fallback={<ReportCardSkeleton />}>
        <ReportCardContent competitorId={competitorId} />
      </Suspense>
    </div>
  );
}

function ReportCardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header Skeleton */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg p-8">
        <div className="h-8 w-64 bg-white/20 rounded mb-2" />
        <div className="h-4 w-48 bg-white/20 rounded" />
      </div>

      {/* Stats Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="border rounded-lg p-4 bg-gray-50">
            <div className="h-4 w-24 bg-gray-200 rounded mb-2" />
            <div className="h-8 w-16 bg-gray-200 rounded" />
          </div>
        ))}
      </div>

      {/* Content Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="h-96 w-full bg-gray-100 rounded border" />
          <div className="h-64 w-full bg-gray-100 rounded border" />
        </div>
        <div className="space-y-6">
          <div className="h-64 w-full bg-gray-100 rounded border" />
        </div>
      </div>
    </div>
  );
}