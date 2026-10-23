/**
 * Every call to the brain goes through here. When the API is protected the
 * token is the one Auth0 handed to the page and the page put in sessionStorage;
 * when it is not, this is an ordinary fetch.
 */
export function api(path: string, init?: RequestInit): Promise<Response> {
  const token = sessionStorage.getItem("lazy-susan-token");
  const headers = new Headers(init?.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  return fetch(path, { ...init, headers });
}

/** The body of a failed request is the server's own sentence. Keep it. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function extract<T>(res: Response): Promise<T> {
  const raw = await res.text();
  let body: unknown = {};
  try {
    body = JSON.parse(raw);
  } catch {
    if (!res.ok) throw new ApiError(res.status, res.statusText || "the brain answered nonsense");
    return {} as T;
  }
  const err = (body as { error?: string }).error;
  if (!res.ok) throw new ApiError(res.status, err ?? (res.statusText || "the request failed"));
  return body as T;
}

export async function getJson<T>(path: string): Promise<T> {
  return extract<T>(await api(path));
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  return extract<T>(
    await api(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function uploadFile<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  return extract<T>(await api(path, { method: "POST", body: form }));
}
