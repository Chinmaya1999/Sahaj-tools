import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { BusinessPageView } from "../components/BusinessPageView";
import { Spinner } from "../components/ui";
import NotFound from "./NotFound";
import { useEffect } from "react";

export default function PublicPage() {
  const { slug } = useParams();
  const q = useQuery({ queryKey: ["public-page", slug], queryFn: () => api<{ page: any }>(`/public/pages/${slug}`), retry: false });
  useEffect(() => { if (q.data) document.title = q.data.page.businessName; }, [q.data]);
  if (q.isLoading) return <div className="grid place-items-center py-24"><Spinner /></div>;
  if (q.error) return <NotFound />;
  return <div className="px-4 py-8"><BusinessPageView page={q.data!.page} /><p className="mt-6 text-center text-xs text-ink-2">Made with Oqzra</p></div>;
}
