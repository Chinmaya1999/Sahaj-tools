export class ApiError extends Error {
  constructor(public status: number, message: string, public code: string, public body: Record<string, any> = {}) { super(message); }
  get fields(): Record<string, string> { return this.body.fields ?? {}; }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-Requested-With": "ek" },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Check your connection and try again.", "network");
  }
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON */ }
  if (!res.ok) throw new ApiError(res.status, json.error ?? `Request failed (${res.status})`, json.code ?? "error", json);
  return json as T;
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");
