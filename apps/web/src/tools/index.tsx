import { lazy, Suspense } from "react";
import { Link, useParams } from "react-router-dom";
import { PRODUCTS, type ProductSlug } from "@ek/shared";
import { Alert, Badge, LinkButton, Spinner } from "../components/ui";
import { useAuth } from "../lib/auth";
import { useAccess } from "../lib/data";
import NotFound from "../pages/NotFound";

const registry: Record<ProductSlug, { Component: React.LazyExoticComponent<React.ComponentType>; needsAccount: boolean }> = {
  invoice: { Component: lazy(() => import("./Invoice")), needsAccount: true },
  resume: { Component: lazy(() => import("./Resume")), needsAccount: true },
  inventory: { Component: lazy(() => import("./Inventory")), needsAccount: true },
  invitation: { Component: lazy(() => import("./Invitation")), needsAccount: false },
  "pdf-tools": { Component: lazy(() => import("./PdfTools")), needsAccount: false },
  "qr-business": { Component: lazy(() => import("./QrBusiness")), needsAccount: false },
  "photo-tools": { Component: lazy(() => import("./PhotoTools")), needsAccount: false },
};

export default function ToolPage() {
  const { slug } = useParams();
  const p = PRODUCTS.find((x) => x.slug === slug);
  const { user, loading } = useAuth();
  const access = useAccess().get(slug ?? "");
  if (!p) return <NotFound />;
  const { Component, needsAccount } = registry[p.slug];
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="no-print mb-6 flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-3xl font-semibold sm:text-4xl"><span aria-hidden>{p.icon}</span> {p.name}</h1><p className="mt-1 text-ink-2">{p.short}</p></div>
        <div className="flex flex-wrap items-center gap-2">{access?.paid ? <Badge tone="brand">Paid plan active</Badge> : <Badge tone="ok">Free</Badge>}<Link className="text-sm font-semibold text-brand underline" to={`/tools/${p.slug}/about`}>Plans & pricing</Link></div>
      </div>
      {needsAccount && !user ? (loading ? <Spinner /> : (
        <div className="mx-auto max-w-lg space-y-4 py-8 text-center"><Alert>This tool saves your work, so it needs a free account.</Alert><div className="flex justify-center gap-2"><LinkButton to="/login" state={{ from: `/tools/${p.slug}` }}>Sign in</LinkButton><LinkButton to="/register" variant="secondary">Create free account</LinkButton></div></div>
      )) : <Suspense fallback={<div className="grid place-items-center py-24"><Spinner /></div>}><Component /></Suspense>}
    </div>
  );
}
