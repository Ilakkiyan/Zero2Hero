/** Build a streaming NDJSON Response, as the streaming API routes return. */
export function ndjsonResponse(events: unknown[], init: { ok?: boolean; status?: number } = {}): Response {
  const status = init.status ?? (init.ok === false ? 500 : 200);
  const body = events.map((e) => JSON.stringify(e) + "\n").join("");
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}

/** Build a non-streaming JSON error Response. */
export function errorResponse(error: string, status = 500): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
