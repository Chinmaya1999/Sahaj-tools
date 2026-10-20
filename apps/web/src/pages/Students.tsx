import { Link } from "react-router-dom";
import { BRAND, STUDENT_FAQ } from "@ek/shared";
import { Card, LinkButton } from "../components/ui";
import { PageHero } from "../components/PageHero";

const PICKS = [
  { to: "/tools/resume", icon: "📄", title: "Resume builder for freshers", text: "Clean ATS-friendly resume with live preview, keyword check against the job description and a cover letter." },
  { to: "/tools/photo-tools", icon: "🖼️", title: "Photo & signature resizer", text: "Resize to the exact pixels and KB (20KB, 50KB and more) that exam and job forms ask for. Nothing is uploaded." },
  { to: "/tools/pdf-tools", icon: "🗂️", title: "Merge, split & JPG to PDF", text: "Combine assignments, split pages, rotate and turn photos into one PDF, right in your browser." },
  { to: "/tools/qr-business", icon: "🔳", title: "QR codes", text: "QR codes for links, WhatsApp, UPI and your portfolio or project page." },
  { to: "/tools/invitation", icon: "💌", title: "Invitation maker", text: "Farewell, fest and birthday cards with correct English and Odia text." },
  { to: "/bundles", icon: "🎓", title: "Student bundle", text: "Resume, PDF and photo tools together at a low one-time price. No auto-renewal." },
] as const;

export default function Students() {
  return (
    <>
      <PageHero eyebrow="For students" title="Free online tools every student needs" sub={`${BRAND.name} puts the things students search for in one place: a resume builder, photo and signature resizer for application forms, PDF merge, JPG to PDF and QR codes. Free to start, works on your phone.`}>
        <div className="flex flex-wrap gap-3"><LinkButton to="/tools/photo-tools">Resize a photo</LinkButton><LinkButton to="/tools/resume" variant="secondary">Build a resume</LinkButton></div>
      </PageHero>
      <section className="mx-auto max-w-6xl px-4 py-10" aria-labelledby="st-h">
        <h2 id="st-h" className="text-2xl font-semibold">Pick a tool</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PICKS.map((p) => (
            <Link key={p.to} to={p.to} className="group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              <Card className="h-full p-5 transition-colors group-hover:border-brand"><span aria-hidden className="text-3xl">{p.icon}</span><h3 className="mt-3 font-sans text-lg font-semibold">{p.title}</h3><p className="mt-1 text-sm text-ink-2">{p.text}</p></Card>
            </Link>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-3xl px-4 pb-12" aria-labelledby="stf-h">
        <h2 id="stf-h" className="text-2xl font-semibold">Student questions, answered</h2>
        <div className="mt-5 space-y-4">{STUDENT_FAQ.map((f) => <div key={f.q}><h3 className="font-sans text-base font-semibold">{f.q}</h3><p className="mt-1 text-sm text-ink-2">{f.a}</p></div>)}</div>
      </section>
    </>
  );
}
