/**
 * Client-side reader for the NDJSON token stream used by /api/interview and
 * /api/draft. Calls `onToken` for each chunk, resolves with the final "done"
 * payload, and throws on an error event or non-ok response.
 */

export type TokenEvent =
  | { type: "token"; value: string }
  | { type: "done"; readyToPlan?: boolean }
  | { type: "error"; message: string };

export async function readTokenStream(
  res: Response,
  onToken: (text: string) => void,
): Promise<{ readyToPlan?: boolean }> {
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;

      const evt = JSON.parse(line) as TokenEvent;
      if (evt.type === "token") onToken(evt.value);
      else if (evt.type === "error") throw new Error(evt.message);
      else if (evt.type === "done") return { readyToPlan: evt.readyToPlan };
    }
  }

  return {};
}
