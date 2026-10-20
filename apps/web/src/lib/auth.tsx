import { createContext, useContext, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export interface User { id: string; email: string; name: string; role: "customer" | "admin" }
interface Ctx { user: User | null; loading: boolean; login(email: string, password: string): Promise<void>; register(name: string, email: string, password: string): Promise<void>; logout(): Promise<void> }
const AuthCtx = createContext<Ctx>(null as never);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: User | null }>("/auth/me"), staleTime: 60_000 });
  const reset = () => qc.clear();
  const login = useMutation({ mutationFn: (v: { email: string; password: string }) => api<{ user: User }>("/auth/login", { body: v }), onSuccess: (d) => { reset(); qc.setQueryData(["me"], d); } });
  const register = useMutation({ mutationFn: (v: { name: string; email: string; password: string }) => api<{ user: User }>("/auth/register", { body: v }), onSuccess: (d) => { reset(); qc.setQueryData(["me"], d); } });
  const logout = useMutation({ mutationFn: () => api("/auth/logout", { method: "POST", body: {} }), onSuccess: () => { reset(); qc.setQueryData(["me"], { user: null }); } });
  return (
    <AuthCtx.Provider value={{
      user: me.data?.user ?? null, loading: me.isLoading,
      login: async (email, password) => { await login.mutateAsync({ email, password }); },
      register: async (name, email, password) => { await register.mutateAsync({ name, email, password }); },
      logout: async () => { await logout.mutateAsync(); },
    }}>{children}</AuthCtx.Provider>
  );
}
