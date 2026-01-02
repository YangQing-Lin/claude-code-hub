export async function readJsonBody<T extends object = object>(
  req: Request,
): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  try {
    const text = await req.text();
    if (!text) return { ok: true, value: {} as T };
    return { ok: true, value: JSON.parse(text) as T };
  } catch (error) {
    return { ok: false, error };
  }
}

export function isStreamRequest(body: unknown): boolean {
  if (body && typeof body === "object" && "stream" in body) {
    return (body as { stream?: unknown }).stream === true;
  }
  return false;
}

