import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PRODUCTS } from "@ek/shared";
import { ProductDemo } from "../components/ProductDemo";
import { BusinessPageView } from "../components/BusinessPageView";
import { ProductCard } from "../components/ProductCard";
import { Login } from "../pages/AuthPages";
import { AuthProvider } from "../lib/auth";

const wrap = (ui: React.ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>
);

describe("ProductDemo", () => {
  it("invoice demo recalculates totals live with tax", async () => {
    render(wrap(<ProductDemo slug="invoice" />));
    expect(screen.getByText("₹1,180.00")).toBeInTheDocument(); // 2 x 500 + 18%
    const qty = screen.getByLabelText("Qty");
    await userEvent.clear(qty); await userEvent.type(qty, "4");
    expect(screen.getByText("₹2,360.00")).toBeInTheDocument();
  });
  it("invoice demo rejects an invalid quantity instead of showing a total", async () => {
    render(wrap(<ProductDemo slug="invoice" />));
    const qty = screen.getByLabelText("Qty");
    await userEvent.clear(qty); await userEvent.type(qty, "-1");
    expect(screen.getByRole("alert")).toHaveTextContent(/invalid quantity/i);
  });
  it("inventory demo flags low stock", async () => {
    render(wrap(<ProductDemo slug="inventory" />));
    expect(screen.queryByText("Low")).toBeNull();
    await userEvent.click(screen.getByLabelText("Sell one Aloe face wash"));
    expect(screen.getByText("Low")).toBeInTheDocument();
  });
  it("renders a demo for every product", () => {
    for (const p of PRODUCTS) { const { unmount } = render(wrap(<ProductDemo slug={p.slug} />)); unmount(); }
  });
});

describe("BusinessPageView (public page safety)", () => {
  it("renders hostile text as plain text, not HTML", () => {
    const { container } = render(<BusinessPageView page={{ slug: "x", businessName: '<img src=x onerror="alert(1)">Shop', about: "<script>alert(1)</script>" }} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent('<img src=x onerror="alert(1)">Shop');
  });
  it("drops javascript: links and builds safe tel/wa links", () => {
    render(<BusinessPageView page={{ slug: "x", businessName: "S", website: "javascript:alert(1)", mapUrl: "data:text/html,x", phone: "+91 98765 43210", whatsapp: "91-98765-43210" }} />);
    expect(screen.queryByText("Website")).toBeNull();
    expect(screen.queryByText("Open map")).toBeNull();
    expect(screen.getByText("Call")).toHaveAttribute("href", "tel:+919876543210");
    expect(screen.getByText("WhatsApp")).toHaveAttribute("href", "https://wa.me/919876543210");
  });
});

describe("ProductCard", () => {
  it("shows the real problem, free tier, actual price, and both calls to action", () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ products: [], plans: [], bundles: [], assets: [], provider: "sandbox" }))));
    render(wrap(<ProductCard product={PRODUCTS[0]} />));
    expect(screen.getByText(PRODUCTS[0].problem)).toBeInTheDocument();
    expect(screen.getByText(/Free: 2 documents per month/)).toBeInTheDocument();
    expect(screen.getByText(/from/i)).toHaveTextContent("₹29");
    expect(screen.getByRole("link", { name: "Try it" })).toHaveAttribute("href", "/tools/invoice");
    expect(screen.getByRole("link", { name: "Upgrade" })).toHaveAttribute("href", "/tools/invoice/about");
  });
});

describe("Login form", () => {
  it("shows accessible validation errors without calling the server", async () => {
    const f = vi.fn(async (..._a: unknown[]) => new Response(JSON.stringify({ user: null })));
    vi.stubGlobal("fetch", f);
    render(wrap(<AuthProvider><Login /></AuthProvider>));
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    const email = screen.getByLabelText("Email");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Enter a valid email")).toBeInTheDocument();
    expect(f.mock.calls.some((c) => String(c[0]).includes("/auth/login"))).toBe(false);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
describe("page shell and Content-Security-Policy", () => {
  it("has no inline <script> (the server's CSP would block it and break features such as the saved theme)", () => {
    const html = readFileSync(resolve(__dirname, "../../index.html"), "utf8");
    const inline = [...html.matchAll(/<script\b([^>]*)>/gi)].filter((m) => !/\bsrc\s*=/.test(m[1]));
    expect(inline).toHaveLength(0);
    expect(html).toContain('src="/theme-init.js"');
  });
  it("ships the theme bootstrap as a static file", () => {
    expect(readFileSync(resolve(__dirname, "../../public/theme-init.js"), "utf8")).toContain("sahaj-theme");
  });
});
