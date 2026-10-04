import { serviceFetch } from "./connectivity";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}
let csrf: { token: string; headerName: string } | undefined;
export async function refreshCsrf() {
  const response = await serviceFetch("/api/v1/auth/csrf", {
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("Cannot establish a secure session.");
  csrf = await response.json();
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const headers = new Headers();
  if (body !== undefined) {
    if (!csrf) await refreshCsrf();
    headers.set(csrf!.headerName, csrf!.token);
    if (!(body instanceof FormData))
      headers.set(
        "Content-Type",
        body instanceof URLSearchParams
          ? "application/x-www-form-urlencoded"
          : "application/json",
      );
  }
  const response = await serviceFetch("/api/v1" + path, {
    credentials: "same-origin",
    method: body === undefined ? "GET" : "POST",
    headers,
    body:
      body === undefined
        ? undefined
        : body instanceof FormData || body instanceof URLSearchParams
          ? body
          : JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(
      error.message || "The request could not be completed.",
      response.status,
      error.code || "REQUEST_FAILED",
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
