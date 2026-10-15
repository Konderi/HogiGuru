import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';

export type Role = 'superadmin' | 'admin' | 'guru';
export const isAdminRole = (r?: string | null) => r === 'admin' || r === 'superadmin';
export const ROLE_LABEL: Record<Role, string> = { superadmin: 'Pääylläpitäjä', admin: 'Ylläpitäjä', guru: 'Guru' };

export interface Me {
  user: { id: number; email: string; name: string; role: Role } | null;
  guru?: { id: number; name: string } | null;
  favTeam?: { id: string; name: string; short_name: string | null; logo: string | null } | null;
  draftNav?: boolean;
  needsSetup?: boolean;
}

const AuthCtx = createContext<{ me: Me | null; refresh: () => Promise<void>; logout: () => Promise<void> }>({
  me: null, refresh: async () => {}, logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const refresh = useCallback(async () => setMe(await api<Me>('/auth/me').catch(() => ({ user: null }))), []);
  const logout = useCallback(async () => { await api('/auth/logout', { method: 'POST' }); await refresh(); }, [refresh]);
  useEffect(() => { refresh(); }, [refresh]);
  return <AuthCtx.Provider value={{ me, refresh, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

/** Pieni datanhakuhook: lataus, virhe, uudelleenhaku. */
export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try { setData(await api<T>(path)); setError(null); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load, setData };
}
