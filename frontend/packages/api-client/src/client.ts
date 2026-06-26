// Generic fetch wrapper. Auth/CSRF/refresh logic lands in Phase 4.

export type ApiClientOptions = {
  baseUrl: string;
  defaultHeaders?: Record<string, string>;
  fetchImpl?: typeof fetch;
};

export class ApiClient {
  readonly baseUrl: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.defaultHeaders = opts.defaultHeaders ?? {};
    // Bind to globalThis: storing `fetch` as `this.fetchImpl` and calling
    // `this.fetchImpl(...)` would otherwise invoke fetch with `this === ApiClient`,
    // which the browser rejects with "Illegal invocation".
    this.fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
  }

  async get<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      method: "GET",
      headers: { ...this.defaultHeaders, ...(init?.headers ?? {}) },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
    return (await res.json()) as T;
  }

  async post<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
    return this._jsonBody<T>("POST", path, body, init);
  }

  async patch<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
    return this._jsonBody<T>("PATCH", path, body, init);
  }

  async delete(path: string, init?: RequestInit): Promise<void> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      method: "DELETE",
      headers: { ...this.defaultHeaders, ...(init?.headers ?? {}) },
    });
    // 204 No Content is the happy path; some endpoints return 200 with a body.
    if (!res.ok && res.status !== 204) {
      throw new Error(`DELETE ${path} failed: ${res.status} ${await res.text()}`);
    }
  }

  private async _jsonBody<T>(
    method: "POST" | "PATCH" | "PUT",
    path: string,
    body: unknown,
    init?: RequestInit,
  ): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      method,
      headers: {
        "content-type": "application/json",
        ...this.defaultHeaders,
        ...(init?.headers ?? {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  }
}
