import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getUser, WKApiError } from "../api/client";
import type { WKUser } from "../api/types";
import { tokenStorage } from "../auth/tokenStorage";

type AuthStatus = "loading" | "signedOut" | "signedIn";

interface AuthState {
  status: AuthStatus;
  token: string | null;
  user: WKUser | null;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<WKUser | null>(null);

  // On app start: load the saved token. If we're offline we still let the
  // user in (offline-first); only an explicit 401 signs them out.
  useEffect(() => {
    (async () => {
      const saved = await tokenStorage.get();
      if (!saved) {
        setStatus("signedOut");
        return;
      }
      setToken(saved);
      setStatus("signedIn");
      try {
        const res = await getUser(saved);
        setUser(res.data);
      } catch (e) {
        if (e instanceof WKApiError && e.kind === "unauthorized") {
          await tokenStorage.clear();
          setToken(null);
          setStatus("signedOut");
        }
      }
    })();
  }, []);

  const signIn = useCallback(async (raw: string) => {
    const candidate = raw.trim();
    const res = await getUser(candidate); // throws WKApiError if invalid
    await tokenStorage.set(candidate);
    setToken(candidate);
    setUser(res.data);
    setStatus("signedIn");
  }, []);

  const signOut = useCallback(async () => {
    await tokenStorage.clear();
    setToken(null);
    setUser(null);
    setStatus("signedOut");
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    const res = await getUser(token);
    setUser(res.data);
  }, [token]);

  const value = useMemo(
    () => ({ status, token, user, signIn, signOut, refreshUser }),
    [status, token, user, signIn, signOut, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
