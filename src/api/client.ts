import type { WKAssignment, WKCollection, WKCollectionItem, WKResource, WKUser } from "./types";

const BASE_URL = "https://api.wanikani.com/v2";
const API_REVISION = "20170710";
const MAX_RETRIES = 3;

export class WKApiError extends Error {
  constructor(
    message: string,
    public readonly kind: "unauthorized" | "rate_limited" | "network" | "server" | "client",
    public readonly status?: number,
  ) {
    super(message);
    this.name = "WKApiError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Accepts an API path ("/subjects") or a full URL from a collection's
 * `pages.next_url`. Full URLs must point at the WaniKani API, so the token
 * is never sent anywhere else.
 */
function resolveUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    if (!pathOrUrl.startsWith(`${BASE_URL}/`)) {
      throw new WKApiError("Refusing to send the API token outside WaniKani.", "client");
    }
    return pathOrUrl;
  }
  return `${BASE_URL}${pathOrUrl}`;
}

/**
 * Thin wrapper around fetch for the WaniKani API.
 * - Adds auth and revision headers
 * - Retries on 429 (rate limit: 60 req/min) using the RateLimit-Reset header
 * - Maps failures to WKApiError so screens can show a clear message
 */
export async function wkRequest<T>(
  token: string,
  path: string,
  init: RequestInit = {},
  attempt = 0,
): Promise<T> {
  let res: Response;
  const url = resolveUrl(path);
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Wanikani-Revision": API_REVISION,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new WKApiError("No connection to WaniKani. Check your internet and try again.", "network");
  }

  if (res.ok) return (await res.json()) as T;

  if (res.status === 401) {
    throw new WKApiError("This API token isn't valid. Copy it again from WaniKani settings.", "unauthorized", 401);
  }

  if (res.status === 429) {
    if (attempt >= MAX_RETRIES) {
      throw new WKApiError("WaniKani is limiting requests. Wait a minute and try again.", "rate_limited", 429);
    }
    const reset = Number(res.headers.get("RateLimit-Reset"));
    const waitMs = reset ? Math.max(reset * 1000 - Date.now(), 1000) : 5000;
    await sleep(Math.min(waitMs, 60_000));
    return wkRequest<T>(token, url, init, attempt + 1);
  }

  if (res.status >= 500) {
    throw new WKApiError("WaniKani's server had a problem. Try again shortly.", "server", res.status);
  }

  throw new WKApiError(`Request failed (${res.status}).`, "client", res.status);
}

export function getUser(token: string) {
  return wkRequest<WKResource<WKUser>>(token, "/user");
}

/** One page of a collection endpoint. Pass a path for page 1, then `pages.next_url`. */
export function getCollectionPage<T>(token: string, pathOrNextUrl: string) {
  return wkRequest<WKCollection<T>>(token, pathOrNextUrl);
}

export function getAssignment(token: string, id: number) {
  return wkRequest<WKCollectionItem<WKAssignment>>(token, `/assignments/${id}`);
}

/**
 * Marks a lesson as done on WaniKani. `startedAt` is when the lesson was
 * actually finished (it may be earlier than now if it was done offline).
 */
export function startAssignment(token: string, id: number, startedAt: string) {
  return wkRequest<WKCollectionItem<WKAssignment>>(token, `/assignments/${id}/start`, {
    method: "PUT",
    body: JSON.stringify({ assignment: { started_at: startedAt } }),
  });
}
