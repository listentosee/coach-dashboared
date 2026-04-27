import { createCertificateServiceClient } from '@/lib/certificates/public';
import { CoachSurveyFrame } from './survey-frame';

export const dynamic = 'force-dynamic';

const COACH_FILLOUT_FORM_ID = process.env.NEXT_PUBLIC_FILLOUT_COACH_FORM_ID || 'bJKURVuG1zus';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CoachSurveyPageProps = {
  params: Promise<{ id: string }>;
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

export default async function CoachSurveyPage({ params }: CoachSurveyPageProps) {
  const { id } = await params;

  // Validate the ID *before* hitting the DB so we don't leak query latency
  // on bogus URLs. The send-route always issues a real UUID, so any miss
  // here is either a typo or someone fishing for valid IDs.
  if (!UUID_REGEX.test(id)) {
    return (
      <PageShell
        title="Coach Survey Link Not Found"
        description="This survey link is invalid or no longer available."
      >
        <p className="text-sm text-slate-300">Check the link in your email or contact Cyber-Guild.</p>
      </PageShell>
    );
  }

  const supabase = createCertificateServiceClient();

  // Look up the coach profile — confirms the ID is real *and* belongs to a
  // coach (not, say, an admin or a competitor's auth user). Anonymous URL,
  // so we use the service-role client (RLS would otherwise hide the row).
  const { data: coachProfile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', id)
    .eq('role', 'coach')
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  if (!coachProfile) {
    return (
      <PageShell
        title="Coach Survey Link Not Found"
        description="This survey link is invalid or no longer available."
      >
        <p className="text-sm text-slate-300">Check the link in your email or contact Cyber-Guild.</p>
      </PageShell>
    );
  }

  // The dedupe gate: if any survey_results row already exists for this
  // coach, short-circuit before embedding the Fillout iframe so they
  // can't accidentally submit twice. Mirrors the competitor wrapper's
  // survey_completed_at check.
  const { data: existingSubmission, error: submissionError } = await supabase
    .from('survey_results')
    .select('submitted_at')
    .eq('type', 'coach')
    .eq('coach_profile_id', id)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (submissionError) {
    throw submissionError;
  }

  const coachName = coachProfile.full_name?.trim() || 'Coach';

  if (existingSubmission?.submitted_at) {
    return (
      <PageShell
        title="Survey Already Submitted"
        description={`Thanks, ${coachName}. We've already received your feedback.`}
      >
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          Survey received on {new Date(existingSubmission.submitted_at).toLocaleString()}.
        </div>
        <p className="mt-4 text-sm text-slate-300">
          If you believe you reached this page in error or need to update your response, please
          reach out to Cyber-Guild and we&apos;ll help you out.
        </p>
      </PageShell>
    );
  }

  if (!COACH_FILLOUT_FORM_ID) {
    return (
      <PageShell
        title="Coach Feedback Survey"
        description={`Hi ${coachName} — the survey form is not configured yet.`}
      >
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
          Coach feedback form is not configured yet. Please contact Cyber-Guild.
        </div>
      </PageShell>
    );
  }

  const filloutUrl = (() => {
    const url = new URL(`https://form.fillout.com/t/${COACH_FILLOUT_FORM_ID}`);
    url.searchParams.set('type', 'coach');
    url.searchParams.set('id', id);
    return url.toString();
  })();

  return (
    <PageShell
      title="Coach Feedback Survey"
      description={`Hi ${coachName} — please take a moment to share your feedback below. Your responses help us improve next year's competition.`}
    >
      <CoachSurveyFrame filloutUrl={filloutUrl} />
    </PageShell>
  );
}
