const TOKEN_KEY = 'syncpost_token';

// In-memory fallback so artifacts/tests without window still work; browsers use it as primary store.
let memoryToken: string | null = null;

export function getToken(): string | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage.getItem(TOKEN_KEY);
  }
  return memoryToken;
}

export function setToken(token: string | null) {
  memoryToken = token;
  if (typeof window !== 'undefined' && window.localStorage) {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  }
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export function createApiClient(baseUrl: string) {
  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${baseUrl}${path}`, { ...options, headers });

    if (!res.ok) {
      let message = res.statusText;
      try {
        const body = await res.json();
        message = body.message || message;
      } catch {
        // ignore non-JSON error bodies
      }
      throw new ApiError(Array.isArray(message) ? message.join(', ') : message, res.status);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  async function upload<T>(path: string, file: File): Promise<T> {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const form = new FormData();
    form.append('file', file);

    const res = await fetch(`${baseUrl}${path}`, { method: 'POST', headers, body: form });

    if (!res.ok) {
      let message = res.statusText;
      try {
        const body = await res.json();
        message = body.message || message;
      } catch {
        // ignore non-JSON error bodies
      }
      throw new ApiError(Array.isArray(message) ? message.join(', ') : message, res.status);
    }

    return res.json() as Promise<T>;
  }

  return {
    get: <T>(path: string) => request<T>(path, { method: 'GET' }),
    post: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
    patch: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
    delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
    upload,
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
