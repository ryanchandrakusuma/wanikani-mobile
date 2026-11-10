import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AuthProvider, useAuth } from "../../src/contexts/AuthContext";
import { getUser, WKApiError } from "../../src/api/client";
import { tokenStorage } from "../../src/auth/tokenStorage";
import type { WKResource, WKUser } from "../../src/api/types";

jest.mock("../../src/api/client", () => ({
  ...jest.requireActual("../../src/api/client"),
  getUser: jest.fn(),
}));

jest.mock("../../src/auth/tokenStorage", () => ({
  tokenStorage: { get: jest.fn(), set: jest.fn(), clear: jest.fn() },
}));

const mockGetUser = jest.mocked(getUser);
const mockStorage = jest.mocked(tokenStorage);

function userResource(overrides: Partial<WKUser> = {}): WKResource<WKUser> {
  return {
    object: "user",
    url: "https://api.wanikani.com/v2/user",
    data_updated_at: null,
    data: {
      id: "u1",
      username: "koichi",
      level: 7,
      profile_url: "https://www.wanikani.com/users/koichi",
      started_at: "2025-01-01T00:00:00Z",
      current_vacation_started_at: null,
      subscription: { active: true, type: "recurring", max_level_granted: 60, period_ends_at: null },
      ...overrides,
    },
  };
}

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

beforeEach(() => {
  mockGetUser.mockReset();
  mockStorage.get.mockReset();
  mockStorage.set.mockReset().mockResolvedValue(undefined);
  mockStorage.clear.mockReset().mockResolvedValue(undefined);
});

describe("AuthProvider startup", () => {
  it("is signed out when no token is saved", async () => {
    mockStorage.get.mockResolvedValue(null);

    const { result } = await renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("signedOut"));
    expect(result.current.token).toBeNull();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("signs in with the saved token and loads the user", async () => {
    mockStorage.get.mockResolvedValue("saved-tok");
    mockGetUser.mockResolvedValue(userResource());

    const { result } = await renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.user?.username).toBe("koichi"));
    expect(result.current.status).toBe("signedIn");
    expect(result.current.token).toBe("saved-tok");
    expect(mockGetUser).toHaveBeenCalledWith("saved-tok");
  });

  it("stays signed in when offline (offline-first)", async () => {
    mockStorage.get.mockResolvedValue("saved-tok");
    mockGetUser.mockRejectedValue(new WKApiError("offline", "network"));

    const { result } = await renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(mockGetUser).toHaveBeenCalled());
    expect(result.current.status).toBe("signedIn");
    expect(result.current.token).toBe("saved-tok");
    expect(result.current.user).toBeNull();
    expect(mockStorage.clear).not.toHaveBeenCalled();
  });

  it("stays signed in when WaniKani has a server error", async () => {
    mockStorage.get.mockResolvedValue("saved-tok");
    mockGetUser.mockRejectedValue(new WKApiError("down", "server", 503));

    const { result } = await renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(mockGetUser).toHaveBeenCalled());
    expect(result.current.status).toBe("signedIn");
    expect(mockStorage.clear).not.toHaveBeenCalled();
  });

  it("signs out and clears the token when WaniKani rejects it (401)", async () => {
    mockStorage.get.mockResolvedValue("revoked-tok");
    mockGetUser.mockRejectedValue(new WKApiError("bad token", "unauthorized", 401));

    const { result } = await renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("signedOut"));
    expect(result.current.token).toBeNull();
    expect(mockStorage.clear).toHaveBeenCalledTimes(1);
  });
});

describe("signIn", () => {
  it("trims the token, validates it, then saves it", async () => {
    mockStorage.get.mockResolvedValue(null);
    mockGetUser.mockResolvedValue(userResource());
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("signedOut"));

    await act(() => result.current.signIn("  new-tok \n"));

    expect(mockGetUser).toHaveBeenCalledWith("new-tok");
    expect(mockStorage.set).toHaveBeenCalledWith("new-tok");
    expect(result.current.status).toBe("signedIn");
    expect(result.current.token).toBe("new-tok");
    expect(result.current.user?.level).toBe(7);
  });

  it("does not save an invalid token and passes the error to the screen", async () => {
    mockStorage.get.mockResolvedValue(null);
    mockGetUser.mockRejectedValue(new WKApiError("bad token", "unauthorized", 401));
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("signedOut"));

    let thrown: unknown;
    await act(async () => {
      try { await result.current.signIn("bad"); } catch (e) { thrown = e; }
    });

    expect(thrown).toBeInstanceOf(WKApiError);
    expect(mockStorage.set).not.toHaveBeenCalled();
    expect(result.current.status).toBe("signedOut");
    expect(result.current.token).toBeNull();
  });
});

describe("signOut", () => {
  it("clears the token and the user", async () => {
    mockStorage.get.mockResolvedValue("saved-tok");
    mockGetUser.mockResolvedValue(userResource());
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).not.toBeNull());

    await act(() => result.current.signOut());

    expect(mockStorage.clear).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("signedOut");
    expect(result.current.token).toBeNull();
    expect(result.current.user).toBeNull();
  });
});

describe("refreshUser", () => {
  it("reloads the user with the current token", async () => {
    mockStorage.get.mockResolvedValue("saved-tok");
    mockGetUser.mockResolvedValueOnce(userResource({ level: 7 }));
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user?.level).toBe(7));

    mockGetUser.mockResolvedValueOnce(userResource({ level: 8 }));
    await act(() => result.current.refreshUser());

    expect(result.current.user?.level).toBe(8);
    expect(mockGetUser).toHaveBeenLastCalledWith("saved-tok");
  });

  it("does nothing when signed out", async () => {
    mockStorage.get.mockResolvedValue(null);
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("signedOut"));

    await act(() => result.current.refreshUser());

    expect(mockGetUser).not.toHaveBeenCalled();
  });
});

describe("useAuth", () => {
  it("throws a clear error outside AuthProvider", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(async () => {
      await renderHook(() => useAuth());
    }).rejects.toThrow("useAuth must be used inside AuthProvider");
  });
});
