'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface SurveyFrameProps {
  filloutUrl: string;
  token: string;
}

/**
 * Embeds the Fillout survey iframe and polls our status endpoint so the page
 * can auto-refresh the moment the webhook marks the survey as completed.
 *
 * Polls every 4 seconds while the tab is visible. Stops as soon as we see
 * surveyCompleted=true and triggers a hard reload so the server component
 * re-renders with the download UI.
 */
export function SurveyFrame({ filloutUrl, token }: SurveyFrameProps) {
  const router = useRouter();
  const [completed, setCompleted] = useState(false);
  const activeRef = useRef(true);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      if (cancelled || !activeRef.current) return;
      try {
        const res = await fetch(`/api/certificates/claim/${encodeURIComponent(token)}/status`, {
          cache: 'no-store',
        });
        if (res.ok) {
          const data = (await res.json()) as { surveyCompleted?: boolean };
          if (data?.surveyCompleted) {
            setCompleted(true);
            // Give the webhook a moment if it's still finishing, then reload
            // so the server component reads the fresh DB row.
            setTimeout(() => {
              if (!cancelled) router.refresh();
            }, 800);
            return; // stop polling
          }
        }
      } catch {
        // ignore — will retry on next tick
      }
    }

    const intervalId = setInterval(tick, 4000);

    const onVisibilityChange = () => {
      activeRef.current = document.visibilityState === 'visible';
      if (activeRef.current) tick(); // immediate check on tab refocus
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [token, router]);

  return (
    <>
      {completed ? (
        <div className="mb-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          Survey received — loading your certificate…
        </div>
      ) : null}
      <iframe
        title="Competition certificate survey"
        src={filloutUrl}
        className="w-full rounded-xl border border-white/10 bg-white"
        style={{ minHeight: '720px' }}
      />
      <div className="mt-3 text-xs text-slate-400">
        If the embedded form does not load, open it directly:{' '}
        <a className="underline" href={filloutUrl}>
          competitor survey
        </a>
      </div>
    </>
  );
}
