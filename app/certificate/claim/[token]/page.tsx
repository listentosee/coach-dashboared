import Link from 'next/link';
import {
  COMPETITOR_FILLOUT_FORM_ID,
  getCertificateClaimByToken,
} from '@/lib/certificates/public';
import { SurveyFrame } from './survey-frame';

export const dynamic = 'force-dynamic';

type ClaimPageProps = {
  params: Promise<{ token: string }>;
};

function PageShell({
  title,
  children,
  description,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-meta-dark px-4 py-10 text-meta-light">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20">
          <h1 className="text-3xl font-semibold">{title}</h1>
          {description ? <p className="mt-2 text-sm text-slate-300">{description}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}

export default async function CertificateClaimPage({ params }: ClaimPageProps) {
  const { token } = await params;
  const certificate = await getCertificateClaimByToken(token);

  if (!certificate) {
    return (
      <PageShell
        title="Certificate Link Not Found"
        description="This certificate link is invalid or no longer available."
      >
        <p className="text-sm text-slate-300">Check the link in your email or contact your coach.</p>
      </PageShell>
    );
  }

  const competitorName = [certificate.competitors?.first_name, certificate.competitors?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim() || 'Competitor';
  const filloutUrl = `https://form.fillout.com/t/${COMPETITOR_FILLOUT_FORM_ID}?type=competitor&id=${encodeURIComponent(certificate.competitor_id)}&claim_token=${encodeURIComponent(token)}`;

  if (certificate.survey_completed_at) {
    return (
      <PageShell
        title="Certificate Ready"
        description={`Thanks, ${competitorName}. Your survey is complete and your certificate is ready.`}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            Survey completed on {new Date(certificate.survey_completed_at).toLocaleString()}.
          </div>
          <Link
            href={`/api/certificates/download/${token}`}
            className="inline-flex items-center rounded-lg bg-emerald-500 px-4 py-2 font-medium text-slate-950 transition hover:bg-emerald-400"
          >
            Download Certificate
          </Link>
          <p className="text-xs text-slate-400">
            Downloads so far: {certificate.download_count || 0}
          </p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Complete Survey To Unlock Certificate"
      description={`Your certificate for ${certificate.certificate_year} is waiting. Complete the short survey below to unlock the download.`}
    >
      <div className="mb-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
        <div className="font-medium text-white">{competitorName}</div>
        <div>Certificate year: {certificate.certificate_year}</div>
      </div>

      {COMPETITOR_FILLOUT_FORM_ID ? (
        <SurveyFrame filloutUrl={filloutUrl} token={token} />
      ) : (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
          Competitor survey form is not configured yet.
        </div>
      )}
    </PageShell>
  );
}
