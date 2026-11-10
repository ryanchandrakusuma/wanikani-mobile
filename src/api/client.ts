import type { WKResource, WKUser } from "./types";

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
  try {
    res = await fetch(`${BASE_URL}${path}`, {
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
    return wkRequest<T>(token, path, init, attempt + 1);
  }

  if (res.status >= 500) {
    throw new WKApiError("WaniKani's server had a problem. Try again shortly.", "server", res.status);
  }

  throw new WKApiError(`Request failed (${res.status}).`, "client", res.status);
}

export function getUser(token: string) {
  return wkRequest<WKResource<WKUser>>(token, "/user");
}
