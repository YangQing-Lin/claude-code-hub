export type ErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function jsonError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  const body: ErrorBody = { error: { code, message, details } };
  return Response.json(body, { status });
}

export function sseError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  const body: ErrorBody = { error: { code, message, details } };
  const payload = `data: ${JSON.stringify(body)}\n\n`;
  const done = "data: [DONE]\n\n";
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.enqueue(encoder.encode(done));
      controller.close();
    },
  });

  return new Response(stream, {
    status,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

