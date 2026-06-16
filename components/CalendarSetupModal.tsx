"use client";

interface Props {
  onClose: () => void;
}

const REDIRECT_URI = "http://localhost:3000/api/calendar/callback";

/**
 * In-app Google Calendar setup guide. The "Add to Google Calendar" button needs
 * a one-time Google OAuth client; rather than send people to the README, these
 * are the exact steps, in context, next to the button.
 */
export default function CalendarSetupModal({ onClose }: Props) {
  const steps: { title: string; body: React.ReactNode }[] = [
    {
      title: "Create / pick a Google Cloud project",
      body: (
        <>
          Open the{" "}
          <a
            href="https://console.cloud.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline"
          >
            Google Cloud Console
          </a>{" "}
          and create or select a project.
        </>
      ),
    },
    {
      title: "Enable the Calendar API",
      body: <>APIs &amp; Services → Library → enable <strong>Google Calendar API</strong>.</>,
    },
    {
      title: "Configure the OAuth consent screen",
      body: (
        <>
          User type <strong>External</strong>, fill the basics, keep it in <strong>Testing</strong>,
          and add your own Google account under <strong>Test users</strong> (no verification needed
          while testing).
        </>
      ),
    },
    {
      title: "Create an OAuth client ID",
      body: (
        <>
          Credentials → Create credentials → <strong>OAuth client ID → Web application</strong>.
          Under <strong>Authorized redirect URIs</strong> add exactly:
          <code className="mt-1 block rounded bg-surface-2 px-2 py-1 text-[11px] text-text">
            {REDIRECT_URI}
          </code>
        </>
      ),
    },
    {
      title: "Add the credentials to .env.local",
      body: (
        <code className="block whitespace-pre rounded bg-surface-2 px-2 py-1.5 text-[11px] leading-relaxed text-text">
          {`GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=${REDIRECT_URI}`}
        </code>
      ),
    },
    {
      title: "Restart & connect",
      body: (
        <>
          Restart the app, then click <strong>📅 Add to Google Calendar</strong> → consent once →
          milestones appear as events. Tokens stay in an httpOnly cookie, never in the browser.
        </>
      ),
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-text">📅 Google Calendar sync — setup (~5 min)</p>
          <button
            onClick={onClose}
            className="ml-auto rounded-lg px-2 py-1 text-sm text-muted transition-colors hover:text-text"
          >
            ✕
          </button>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          A one-time Google OAuth client lets the app push your milestones to your calendar. It&apos;s
          entirely optional — everything else works without it.
        </p>

        <ol className="mt-4 space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-medium text-text">
                {i + 1}
              </span>
              <div className="min-w-0 space-y-1 text-xs leading-relaxed text-muted">
                <p className="font-medium text-text">{s.title}</p>
                <div>{s.body}</div>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-bg transition-opacity hover:opacity-90"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
