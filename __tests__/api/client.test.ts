import {
  createReview, getAssignment, getCollectionPage, getUser, startAssignment, wkRequest, WKApiError,
} from "../../src/api/client";

type FakeResponse = {
  ok: boolean;
  status: number;
  headers: { get: (name: string) => string | null };
  json: () => Promise<unknown>;
};

function response(status: number, body: unknown = {}, headers: Record<string, string> = {}): FakeResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name] ?? null },
    json: async () => body,
  };
}

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
});

async function expectApiError(promise: Promise<unknown>, kind: WKApiError["kind"], status?: number) {
  const err = await promise.then(
    () => { throw new Error("expected request to fail"); },
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(WKApiError);
  expect((err as WKApiError).kind).toBe(kind);
  expect((err as WKApiError).status).toBe(status);
}

describe("wkRequest", () => {
  it("sends auth and revision headers to the v2 base URL", async () => {
    fetchMock.mockResolvedValueOnce(response(200, { ok: true }));

    await wkRequest("tok-123", "/user");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.wanikani.com/v2/user");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer tok-123",
      "Wanikani-Revision": "20170710",
      "Content-Type": "application/json",
    });
  });

  it("keeps caller options and lets caller headers be added", async () => {
    fetchMock.mockResolvedValueOnce(response(200));

    await wkRequest("tok", "/reviews", { method: "POST", body: "{}", headers: { "X-Test": "1" } });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.body).toBe("{}");
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok", "X-Test": "1" });
  });

  it("returns the parsed JSON body on success", async () => {
    fetchMock.mockResolvedValueOnce(response(200, { data: { username: "koichi" } }));

    await expect(wkRequest("tok", "/user")).resolves.toEqual({ data: { username: "koichi" } });
  });

  it("maps a fetch failure to a network error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));

    await expectApiError(wkRequest("tok", "/user"), "network", undefined);
  });

  it("maps 401 to unauthorized without retrying", async () => {
    fetchMock.mockResolvedValueOnce(response(401));

    await expectApiError(wkRequest("bad", "/user"), "unauthorized", 401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps 5xx to a server error", async () => {
    fetchMock.mockResolvedValueOnce(response(503));

    await expectApiError(wkRequest("tok", "/user"), "server", 503);
  });

  it("maps other 4xx to a client error", async () => {
    fetchMock.mockResolvedValueOnce(response(422));

    await expectApiError(wkRequest("tok", "/reviews"), "client", 422);
  });

  describe("rate limiting (429)", () => {
    it("waits until RateLimit-Reset, then retries and succeeds", async () => {
      jest.useFakeTimers({ now: new Date("2026-01-01T00:00:00Z") });
      const resetInSeconds = Date.now() / 1000 + 10;
      fetchMock
        .mockResolvedValueOnce(response(429, {}, { "RateLimit-Reset": String(resetInSeconds) }))
        .mockResolvedValueOnce(response(200, { data: "ok" }));

      const promise = wkRequest("tok", "/user");

      await jest.advanceTimersByTimeAsync(9_000);
      expect(fetchMock).toHaveBeenCalledTimes(1); // still waiting

      await jest.advanceTimersByTimeAsync(1_000);
      await expect(promise).resolves.toEqual({ data: "ok" });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("waits 5 seconds when the reset header is missing", async () => {
      jest.useFakeTimers();
      fetchMock
        .mockResolvedValueOnce(response(429))
        .mockResolvedValueOnce(response(200, { data: "ok" }));

      const promise = wkRequest("tok", "/user");

      await jest.advanceTimersByTimeAsync(4_999);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(1);
      await expect(promise).resolves.toEqual({ data: "ok" });
    });

    it("waits at least 1 second when the reset time is already past", async () => {
      jest.useFakeTimers({ now: new Date("2026-01-01T00:00:00Z") });
      const past = Date.now() / 1000 - 30;
      fetchMock
        .mockResolvedValueOnce(response(429, {}, { "RateLimit-Reset": String(past) }))
        .mockResolvedValueOnce(response(200));

      const promise = wkRequest("tok", "/user");

      await jest.advanceTimersByTimeAsync(999);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(1);
      await promise;
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("never waits more than 60 seconds", async () => {
      jest.useFakeTimers({ now: new Date("2026-01-01T00:00:00Z") });
      const farFuture = Date.now() / 1000 + 3_600;
      fetchMock
        .mockResolvedValueOnce(response(429, {}, { "RateLimit-Reset": String(farFuture) }))
        .mockResolvedValueOnce(response(200));

      const promise = wkRequest("tok", "/user");

      await jest.advanceTimersByTimeAsync(60_000);
      await promise;
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("gives up with rate_limited after 3 retries", async () => {
      jest.useFakeTimers();
      fetchMock.mockResolvedValue(response(429));

      const promise = wkRequest("tok", "/user");
      const assertion = expectApiError(promise, "rate_limited", 429);

      await jest.advanceTimersByTimeAsync(3 * 5_000);
      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(4); // 1 original + 3 retries
    });
  });
});

describe("full URLs (pagination)", () => {
  it("follows a WaniKani next_url as-is", async () => {
    fetchMock.mockResolvedValueOnce(response(200, { data: [] }));

    await getCollectionPage("tok", "https://api.wanikani.com/v2/subjects?page_after_id=1000");

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.wanikani.com/v2/subjects?page_after_id=1000");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });

  it("prefixes a relative path with the API base URL", async () => {
    fetchMock.mockResolvedValueOnce(response(200, { data: [] }));

    await getCollectionPage("tok", "/assignments?updated_after=2026-01-01T00:00:00Z");

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.wanikani.com/v2/assignments?updated_after=2026-01-01T00:00:00Z");
  });

  it.each([
    "https://evil.example.com/v2/subjects",
    "https://api.wanikani.com.evil.example.com/v2/subjects",
    "http://api.wanikani.com/v2/subjects",
  ])("never sends the token to %s", async (url) => {
    await expectApiError(getCollectionPage("tok", url), "client", undefined);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the full URL when retrying after a 429", async () => {
    jest.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(response(429))
      .mockResolvedValueOnce(response(200, { data: [] }));
    const url = "https://api.wanikani.com/v2/subjects?page_after_id=1000";

    const promise = getCollectionPage("tok", url);
    await jest.advanceTimersByTimeAsync(5_000);
    await promise;

    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([url, url]);
  });
});

describe("assignments", () => {
  it("starts an assignment with the time the lesson was finished", async () => {
    fetchMock.mockResolvedValueOnce(response(200, { id: 42 }));

    await startAssignment("tok", 42, "2026-03-01T10:00:00.000Z");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.wanikani.com/v2/assignments/42/start");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ assignment: { started_at: "2026-03-01T10:00:00.000Z" } });
  });

  it("fetches a single assignment", async () => {
    fetchMock.mockResolvedValueOnce(response(200, { id: 42 }));

    await expect(getAssignment("tok", 42)).resolves.toEqual({ id: 42 });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.wanikani.com/v2/assignments/42");
  });
});

describe("reviews", () => {
  it("posts a finished review item with the time it was answered", async () => {
    fetchMock.mockResolvedValueOnce(response(200, { resources_updated: {} }));
    const review = {
      assignment_id: 42, incorrect_meaning_answers: 1, incorrect_reading_answers: 0,
      created_at: "2026-03-01T10:00:00.000Z",
    };

    await createReview("tok", review);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.wanikani.com/v2/reviews");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ review });
  });
});

describe("getUser", () => {
  it("requests /user with the given token", async () => {
    const user = { object: "user", url: "", data_updated_at: null, data: { username: "koichi", level: 5 } };
    fetchMock.mockResolvedValueOnce(response(200, user));

    await expect(getUser("tok")).resolves.toEqual(user);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.wanikani.com/v2/user");
  });
});
