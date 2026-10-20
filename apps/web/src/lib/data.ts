import { useQuery } from "@tanstack/react-query";
import type { Plan, ProductInfo, Bundle, DownloadableAssetInfo } from "@ek/shared";
import { api } from "./api";
import { useAuth } from "./auth";

export interface CatalogData { products: (ProductInfo & { published: boolean })[]; plans: (Plan & { active: boolean })[]; bundles: (Bundle & { active: boolean })[]; assets: DownloadableAssetInfo[]; provider: string }
export const useCatalog = () => useQuery({ queryKey: ["catalog"], queryFn: () => api<CatalogData>("/catalog"), staleTime: 5 * 60_000 });

export interface AccessInfo { product: string; planIds: string[]; limits: Record<string, number | boolean | null>; credits: number; expiresAt: string | null; paid: boolean }
export function useAccess() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ["access"], queryFn: () => api<{ access: AccessInfo[] }>("/entitlements"), enabled: !!user, staleTime: 30_000 });
  return { ...q, get: (slug: string) => q.data?.access.find((a) => a.product === slug) };
}
