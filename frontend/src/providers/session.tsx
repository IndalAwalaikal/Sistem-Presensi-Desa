"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { User } from "@/core/domain/user";
import type { AppGateways } from "@/core/ports/gateways";
import { getGateways } from "@/infrastructure/container";

interface SessionState {
  /** undefined = sedang memuat sesi; null = tidak masuk. */
  user: User | null | undefined;
  gateways: AppGateways;
  masuk(email: string, password: string): Promise<void>;
  keluar(): Promise<void>;
  /** Segarkan salinan pengguna dari sumber data. */
  segarkan(): Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const gateways = useMemo(() => getGateways(), []);
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    gateways.auth
      .getCurrentUser()
      .then(setUser)
      .catch(() => setUser(null));
  }, [gateways]);

  const masuk = useCallback(
    async (email: string, password: string) => {
      const u = await gateways.auth.login({ email, password });
      setUser(u);
    },
    [gateways],
  );

  const keluar = useCallback(async () => {
    await gateways.auth.logout();
    setUser(null);
  }, [gateways]);

  const segarkan = useCallback(async () => {
    setUser(await gateways.auth.getCurrentUser());
  }, [gateways]);

  const value = useMemo(
    () => ({ user, gateways, masuk, keluar, segarkan }),
    [user, gateways, masuk, keluar, segarkan],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Akses sesi dan pintu data. Lempar error bila dipakai di luar provider. */
export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession harus dipakai di dalam SessionProvider.");
  return ctx;
}
