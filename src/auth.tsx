import { useEffect, useRef, ReactNode } from "react";
import { api, setSessionExpiredHandler } from "./api";
import { useAppStore, type HubUser } from "./store/appStore";

export type User = HubUser;

/** Compat — lit la session depuis le store Zustand. */
export function useAuth() {
  const user = useAppStore((s) => s.user);
  const loading = useAppStore((s) => s.authLoading);
  const login = useAppStore((s) => s.login);
  const logout = useAppStore((s) => s.logout);
  return { user, loading, login, logout };
}

/** Idle UI aligné sur durée access token démo (60 min). CDC historique = 5 min. */
const IDLE_MS = 60 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const bootstrapAuth = useAppStore((s) => s.bootstrapAuth);
  const hydrateTheme = useAppStore((s) => s.hydrateTheme);
  const logout = useAppStore((s) => s.logout);
  const sessionExpired = useAppStore((s) => s.sessionExpired);
  const user = useAppStore((s) => s.user);
  const setOnline = useAppStore((s) => s.setOnline);
  const timer = useRef<number>();

  useEffect(() => {
    hydrateTheme();
    bootstrapAuth();
  }, [bootstrapAuth, hydrateTheme]);

  useEffect(() => {
    setSessionExpiredHandler((msg) => sessionExpired(msg));
    return () => setSessionExpiredHandler(null);
  }, [sessionExpired]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [setOnline]);

  useEffect(() => {
    const resetIdle = () => {
      window.clearTimeout(timer.current);
      if (api.tokens.access) {
        timer.current = window.setTimeout(logout, IDLE_MS);
      }
    };
    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, resetIdle));
    resetIdle();
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetIdle));
      window.clearTimeout(timer.current);
    };
  }, [user, logout]);

  return <>{children}</>;
}
