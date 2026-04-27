'use client';

interface CoachSurveyFrameProps {
  filloutUrl: string;
}

/**
 * Embeds the coach feedback Fillout form. Unlike the competitor flow, we
 * do NOT poll for completion: Fillout's own confirmation screen displays
 * inside the iframe after submission, and the next time the coach loads
 * this URL the server component will see the survey_results row and
 * short-circuit to the "already submitted" view.
 */
export function CoachSurveyFrame({ filloutUrl }: CoachSurveyFrameProps) {
  return (
    <>
      <iframe
        title="Coach feedback survey"
        src={filloutUrl}
        className="w-full rounded-xl border border-white/10 bg-white"
        style={{ minHeight: '720px' }}
      />
      <div className="mt-3 text-xs text-slate-400">
        If the embedded form does not load, open it directly:{' '}
        <a className="underline" href={filloutUrl}>
          coach feedback survey
        </a>
      </div>
    </>
  );
}
