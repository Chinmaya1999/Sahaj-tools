import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import JSZip from "jszip";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { keywordCompare, resumeSchema, type ResumeInput } from "@ek/shared";
import { Alert, Badge, Button, Card, Empty, Input, Select, Spinner, Textarea, cx } from "../components/ui";
import { useToast } from "../components/toast";
import { ApiError, api, errMsg } from "../lib/api";
import { download } from "../lib/format";

const blank = (): ResumeInput => resumeSchema.parse({});
const TEMPLATES = [["classic", "Classic (free)", false], ["modern", "Modern", true], ["compact", "Compact", true]] as const;

export default function Resume() {
  const [editing, setEditing] = useState<{ id?: string; data?: ResumeInput } | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: ["resumes"], queryFn: () => api<{ items: any[]; premiumTemplates: boolean; aiEnabled: boolean }>("/resumes") });
  if (list.isLoading) return <Spinner />;
  if (editing) return <Editor key={editing.id ?? "new"} id={editing.id} initial={editing.data ?? blank()} premium={list.data!.premiumTemplates} aiEnabled={list.data!.aiEnabled} onClose={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["resumes"] }); }} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-ink-2">{list.data!.items.length} saved version(s)</p><Button onClick={() => setEditing({})}>+ New resume</Button></div>
      {!list.data!.items.length ? <Empty title="No resumes yet">Start with a blank resume – it saves as you go.</Empty> : (
        <div className="grid gap-4 md:grid-cols-2">{list.data!.items.map((r) => (
          <Card key={r.id} className="flex items-center justify-between gap-3 p-4"><div><p className="font-semibold">{r.title}</p><p className="text-xs text-ink-2">{r.template} · updated {new Date(r.updatedAt).toLocaleDateString("en-IN")}</p></div>
            <div className="flex gap-2"><Button variant="secondary" onClick={() => setEditing({ id: r.id, data: resumeSchema.parse(r.data) })}>Open</Button>
              <Button variant="ghost" aria-label={`Duplicate ${r.title}`} onClick={async () => { try { await api(`/resumes/${r.id}/duplicate`, { body: {} }); qc.invalidateQueries({ queryKey: ["resumes"] }); toast("Duplicated"); } catch (e) { toast(errMsg(e), "bad"); } }}>⧉</Button>
              <Button variant="ghost" aria-label={`Delete ${r.title}`} onClick={async () => { if (!confirm(`Delete "${r.title}"?`)) return; await api(`/resumes/${r.id}`, { method: "DELETE" }); qc.invalidateQueries({ queryKey: ["resumes"] }); }}>✕</Button></div></Card>))}</div>)}
    </div>
  );
}

const resumeText = (r: ResumeInput) => [r.personal.fullName, r.personal.headline, r.summary, ...r.experience.flatMap((e) => [e.role, e.company, ...e.bullets]), ...r.education.flatMap((e) => [e.degree, e.school, e.detail]), r.skills.join(" "), ...r.projects.flatMap((p) => [p.name, p.description]), ...r.certifications.map((c) => c.name), r.languages.join(" ")].join(" ");

function writingChecks(r: ResumeInput): string[] {
  const w: string[] = [];
  if (!r.personal.fullName.trim()) w.push("Add your full name.");
  if (!r.personal.email.trim() && !r.personal.phone.trim()) w.push("Add an email or phone number so employers can contact you.");
  if (!r.summary.trim()) w.push("Missing section: professional summary.");
  if (!r.experience.length && !r.projects.length) w.push("Missing section: add work experience or projects.");
  if (!r.education.length) w.push("Missing section: education.");
  if (!r.skills.length) w.push("Missing section: skills.");
  const text = resumeText(r);
  const rep = text.match(/\b(\w{2,})\s+\1\b/i); if (rep) w.push(`Repeated word: "${rep[1]} ${rep[1]}".`);
  if (/ {2,}\S/.test(text.replace(/\n/g, " ").trim()) && / {3,}/.test(text)) w.push("Extra spaces found between words.");
  if (/\bi\b(?!\.)/.test(text.replace(/[A-Za-z]\. i\b/g, ""))) w.push('A lowercase "i" was found – use "I" if you meant the pronoun.');
  for (const e of r.experience) for (const b of e.bullets) if (b && /^[a-z]/.test(b)) { w.push(`A bullet starts with a lowercase letter: "${b.slice(0, 30)}…"`); break; }
  if (r.summary.length > 700) w.push("Your summary is long – 2 to 4 sentences is easier to scan.");
  return [...new Set(w)];
}

function Editor({ id: initialId, initial, premium, aiEnabled, onClose }: { id?: string; initial: ResumeInput; premium: boolean; aiEnabled: boolean; onClose: () => void }) {
  const toast = useToast();
  const [id, setId] = useState(initialId); const [r, setR] = useState(initial); const [tab, setTab] = useState<"edit" | "letter" | "job" | "ai">("edit");
  const [dirty, setDirty] = useState(false); const [upgrade, setUpgrade] = useState("");
  const upd = (patch: Partial<ResumeInput>) => { setR({ ...r, ...patch }); setDirty(true); };
  const checks = useMemo(() => writingChecks(r), [r]);
  const kw = useMemo(() => (r.jobDescription.trim() ? keywordCompare(r.jobDescription, resumeText(r)) : null), [r]);
  useEffect(() => { const h = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); }; window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h); }, [dirty]);

  const save = useMutation({
    mutationFn: () => (id ? api<{ item: any }>(`/resumes/${id}`, { method: "PUT", body: r }) : api<{ item: any }>("/resumes", { body: r })),
    onSuccess: (x) => { setId(x.item.id); setDirty(false); setUpgrade(""); toast("Saved"); },
    onError: (e) => { if (e instanceof ApiError && e.status === 402) setUpgrade(e.message); else toast(errMsg(e), "bad"); },
  });
  async function pack() {
    const z = new JSZip(); const plain = toPlain(r);
    z.file("resume.txt", plain); z.file("cover-letter.txt", r.coverLetter || "(no cover letter written)"); z.file("resume.json", JSON.stringify(r, null, 2));
    z.file("resume.html", `<!doctype html><meta charset="utf-8"><title>${esc(r.personal.fullName)} – Resume</title><body style="font-family:Arial,sans-serif;max-width:720px;margin:24px auto"><pre style="white-space:pre-wrap;font-family:inherit">${esc(plain)}</pre></body>`);
    z.file("README.txt", "Application package from Sahaj.\nresume.txt – plain text for online forms and ATS pasting.\nresume.html – open in a browser and print to PDF.\ncover-letter.txt – your cover letter.\nresume.json – your data, for backup.");
    download(await z.generateAsync({ type: "blob" }), `${(r.personal.fullName || "application").replace(/\W+/g, "-")}-package.zip`);
  }
  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => (!dirty || confirm("Leave without saving?")) && onClose()}>← My resumes</Button>
        <div className="flex flex-wrap gap-2">{dirty && <Badge tone="warn">Unsaved changes</Badge>}<Button loading={save.isPending} onClick={() => save.mutate()}>Save</Button><Button variant="secondary" onClick={() => window.print()}>Print / Save as PDF</Button><Button variant="secondary" disabled={!premium} onClick={pack}>Application package {premium ? "" : "🔒"}</Button></div>
      </div>
      {upgrade && <Alert tone="warn">{upgrade} <Link className="font-semibold underline" to="/tools/resume/about">See Premium</Link></Alert>}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="no-print space-y-4">
          <div role="tablist" aria-label="Resume sections" className="flex flex-wrap gap-1.5">{([["edit", "Resume"], ["letter", "Cover letter"], ["job", "Job match"], ["ai", "AI help"]] as const).map(([k, t]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cx("min-h-10 rounded-lg px-3 text-sm font-medium", tab === k ? "bg-ink text-white" : "bg-paper-2 hover:bg-line")}>{t}</button>)}</div>
          {tab === "edit" && <Form r={r} upd={upd} premium={premium} />}
          {tab === "letter" && <Letter r={r} upd={upd} />}
          {tab === "job" && <Card className="space-y-3 p-4"><Textarea label="Paste the job description" rows={8} value={r.jobDescription} onChange={(e) => upd({ jobDescription: e.target.value })} maxLength={8000} hint="Compared locally with your resume – no AI needed." />
            {kw && <div className="space-y-2 text-sm"><p>Keyword match: <b className="text-lg">{kw.score}%</b> <span className="text-ink-2">(share of the top job-description keywords found in your resume; a rough guide, not an ATS score)</span></p>
              <p><b>Found:</b> {kw.matched.join(", ") || "none"}</p><p><b>Missing:</b> {kw.missing.join(", ") || "none"}</p><p className="text-xs text-ink-2">Only add a missing keyword if it is true for you.</p></div>}</Card>}
          {tab === "ai" && <AiPanel r={r} upd={upd} enabled={aiEnabled} />}
          <Card className="p-4"><h3 className="mb-2 text-base">Checks</h3>{checks.length ? <ul className="list-disc space-y-1 pl-5 text-sm text-warn">{checks.map((c) => <li key={c}>{c}</li>)}</ul> : <p className="text-sm text-ok">No problems found. (This is a simple check, not a full spell-checker – your browser also underlines spelling mistakes as you type.)</p>}</Card>
        </div>
        <div className="print-area rounded-2xl border border-line bg-white p-6 shadow-soft sm:p-8"><Preview r={r} /></div>
      </div>
    </div>
  );
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
function toPlain(r: ResumeInput) {
  const L: string[] = [r.personal.fullName.toUpperCase(), [r.personal.headline, r.personal.email, r.personal.phone, r.personal.location, r.personal.links].filter(Boolean).join(" | "), ""];
  if (r.summary) L.push("SUMMARY", r.summary, "");
  if (r.experience.length) { L.push("EXPERIENCE"); r.experience.forEach((e) => { L.push(`${e.role}, ${e.company} (${e.start} – ${e.end})`); e.bullets.filter(Boolean).forEach((b) => L.push(`- ${b}`)); }); L.push(""); }
  if (r.projects.length) { L.push("PROJECTS"); r.projects.forEach((p) => L.push(`${p.name}${p.link ? ` (${p.link})` : ""}: ${p.description}`)); L.push(""); }
  if (r.education.length) { L.push("EDUCATION"); r.education.forEach((e) => L.push(`${e.degree}, ${e.school} (${e.start} – ${e.end}) ${e.detail}`)); L.push(""); }
  if (r.skills.length) L.push("SKILLS", r.skills.join(", "), "");
  if (r.certifications.length) { L.push("CERTIFICATIONS"); r.certifications.forEach((c) => L.push(`${c.name}, ${c.issuer} ${c.year}`)); L.push(""); }
  if (r.languages.length) L.push("LANGUAGES", r.languages.join(", "));
  return L.join("\n");
}

function Preview({ r }: { r: ResumeInput }) {
  const compact = r.template === "compact"; const modern = r.template === "modern";
  const H = ({ children }: { children: React.ReactNode }) => <h2 className={cx("mb-1 mt-4 border-b pb-0.5 font-sans text-xs font-bold uppercase tracking-wider", modern ? "border-brand text-brand" : "border-ink/30")}>{children}</h2>;
  const p = r.personal;
  return (
    <div className={cx("text-ink", compact ? "text-[12px] leading-snug" : "text-[13px] leading-relaxed")}>
      <h1 className={cx("font-sans font-bold", modern ? "text-3xl text-brand" : "text-2xl")}>{p.fullName || "Your Name"}</h1>
      {p.headline && <p className="text-ink-2">{p.headline}</p>}
      <p className="text-ink-2">{[p.email, p.phone, p.location, p.links].filter(Boolean).join(" · ")}</p>
      {r.summary && <><H>Summary</H><p>{r.summary}</p></>}
      {r.experience.length > 0 && <><H>Experience</H>{r.experience.map((e, i) => <div key={i} className="mb-2"><p className="font-semibold">{e.role}{e.company && `, ${e.company}`} <span className="font-normal text-ink-2">{[e.start, e.end].filter(Boolean).join(" – ")}</span></p><ul className="list-disc pl-5">{e.bullets.filter(Boolean).map((b, j) => <li key={j}>{b}</li>)}</ul></div>)}</>}
      {r.projects.length > 0 && <><H>Projects</H>{r.projects.map((x, i) => <p key={i} className="mb-1"><b>{x.name}</b>{x.link && <span className="text-ink-2"> ({x.link})</span>} – {x.description}</p>)}</>}
      {r.education.length > 0 && <><H>Education</H>{r.education.map((e, i) => <p key={i} className="mb-1"><b>{e.degree}</b>{e.school && `, ${e.school}`} <span className="text-ink-2">{[e.start, e.end].filter(Boolean).join(" – ")}</span>{e.detail && ` – ${e.detail}`}</p>)}</>}
      {r.skills.length > 0 && <><H>Skills</H><p>{r.skills.join(", ")}</p></>}
      {r.certifications.length > 0 && <><H>Certifications</H>{r.certifications.map((c, i) => <p key={i}>{c.name}{c.issuer && `, ${c.issuer}`} {c.year}</p>)}</>}
      {r.languages.length > 0 && <><H>Languages</H><p>{r.languages.join(", ")}</p></>}
    </div>
  );
}

function Form({ r, upd, premium }: { r: ResumeInput; upd: (p: Partial<ResumeInput>) => void; premium: boolean }) {
  const P = (k: keyof ResumeInput["personal"]) => (e: React.ChangeEvent<any>) => upd({ personal: { ...r.personal, [k]: e.target.value } });
  const arr = <K extends "experience" | "education" | "projects" | "certifications">(k: K, i: number, patch: Partial<ResumeInput[K][number]>) => upd({ [k]: (r[k] as any[]).map((x, j) => (j === i ? { ...x, ...patch } : x)) } as any);
  const rm = (k: "experience" | "education" | "projects" | "certifications", i: number) => upd({ [k]: (r[k] as any[]).filter((_, j) => j !== i) } as any);
  const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
  return (
    <div className="space-y-4">
      <Card className="grid gap-3 p-4 sm:grid-cols-2"><Input label="Resume name (for you)" value={r.title} onChange={(e) => upd({ title: e.target.value })} />
        <Select label="Template" value={r.template} onChange={(e) => upd({ template: e.target.value as any })}>{TEMPLATES.map(([v, t, p]) => <option key={v} value={v} disabled={p && !premium}>{t}{p && !premium ? " 🔒 premium" : ""}</option>)}</Select></Card>
      <Card className="grid gap-3 p-4 sm:grid-cols-2"><h3 className="text-lg sm:col-span-2">Personal details</h3><Input label="Full name" value={r.personal.fullName} onChange={P("fullName")} maxLength={80} /><Input label="Headline" value={r.personal.headline} onChange={P("headline")} maxLength={100} /><Input label="Email" value={r.personal.email} onChange={P("email")} /><Input label="Phone" value={r.personal.phone} onChange={P("phone")} /><Input label="Location" value={r.personal.location} onChange={P("location")} /><Input label="Links (LinkedIn, portfolio)" value={r.personal.links} onChange={P("links")} /></Card>
      <Card className="p-4"><Textarea label="Professional summary" value={r.summary} onChange={(e) => upd({ summary: e.target.value })} maxLength={1200} hint={`${r.summary.length}/1200`} /></Card>
      <Section title="Experience" onAdd={() => upd({ experience: [...r.experience, { role: "", company: "", start: "", end: "", bullets: [""] }] })}>
        {r.experience.map((e, i) => <Card key={i} className="space-y-2 p-4"><div className="grid gap-2 sm:grid-cols-2"><Input label="Role" value={e.role} onChange={(x) => arr("experience", i, { role: x.target.value })} /><Input label="Company" value={e.company} onChange={(x) => arr("experience", i, { company: x.target.value })} /><Input label="Start" value={e.start} onChange={(x) => arr("experience", i, { start: x.target.value })} placeholder="Jun 2023" /><Input label="End" value={e.end} onChange={(x) => arr("experience", i, { end: x.target.value })} placeholder="Present" /></div>
          <Textarea label="Achievements (one per line)" rows={4} value={e.bullets.join("\n")} onChange={(x) => arr("experience", i, { bullets: x.target.value.split("\n").slice(0, 12) })} /><Button variant="ghost" onClick={() => rm("experience", i)}>Remove</Button></Card>)}</Section>
      <Section title="Education" onAdd={() => upd({ education: [...r.education, { degree: "", school: "", start: "", end: "", detail: "" }] })}>
        {r.education.map((e, i) => <Card key={i} className="grid gap-2 p-4 sm:grid-cols-2"><Input label="Degree / course" value={e.degree} onChange={(x) => arr("education", i, { degree: x.target.value })} /><Input label="School / college" value={e.school} onChange={(x) => arr("education", i, { school: x.target.value })} /><Input label="Start" value={e.start} onChange={(x) => arr("education", i, { start: x.target.value })} /><Input label="End" value={e.end} onChange={(x) => arr("education", i, { end: x.target.value })} /><Input className="sm:col-span-2" label="Details (marks, honours)" value={e.detail} onChange={(x) => arr("education", i, { detail: x.target.value })} /><Button variant="ghost" onClick={() => rm("education", i)}>Remove</Button></Card>)}</Section>
      <Card className="space-y-3 p-4"><Input label="Skills (comma separated)" value={r.skills.join(", ")} onChange={(e) => upd({ skills: csv(e.target.value).slice(0, 60) })} /><Input label="Languages (comma separated)" value={r.languages.join(", ")} onChange={(e) => upd({ languages: csv(e.target.value).slice(0, 15) })} /></Card>
      <Section title="Projects" onAdd={() => upd({ projects: [...r.projects, { name: "", link: "", description: "" }] })}>
        {r.projects.map((p, i) => <Card key={i} className="space-y-2 p-4"><Input label="Project name" value={p.name} onChange={(x) => arr("projects", i, { name: x.target.value })} /><Input label="Link" value={p.link} onChange={(x) => arr("projects", i, { link: x.target.value })} /><Textarea label="Description" rows={2} value={p.description} onChange={(x) => arr("projects", i, { description: x.target.value })} /><Button variant="ghost" onClick={() => rm("projects", i)}>Remove</Button></Card>)}</Section>
      <Section title="Certifications" onAdd={() => upd({ certifications: [...r.certifications, { name: "", issuer: "", year: "" }] })}>
        {r.certifications.map((c, i) => <Card key={i} className="grid gap-2 p-4 sm:grid-cols-3"><Input label="Name" value={c.name} onChange={(x) => arr("certifications", i, { name: x.target.value })} /><Input label="Issuer" value={c.issuer} onChange={(x) => arr("certifications", i, { issuer: x.target.value })} /><Input label="Year" value={c.year} onChange={(x) => arr("certifications", i, { year: x.target.value })} /><Button variant="ghost" onClick={() => rm("certifications", i)}>Remove</Button></Card>)}</Section>
    </div>
  );
}
function Section({ title, onAdd, children }: { title: string; onAdd: () => void; children: React.ReactNode }) {
  return <section className="space-y-2"><div className="flex items-center justify-between"><h3 className="text-lg">{title}</h3><Button variant="secondary" onClick={onAdd}>+ Add</Button></div>{children}</section>;
}

function Letter({ r, upd }: { r: ResumeInput; upd: (p: Partial<ResumeInput>) => void }) {
  const [role, setRole] = useState(""); const [company, setCompany] = useState("");
  function draft() {
    const top = r.skills.slice(0, 4).join(", ");
    upd({ coverLetter: `Dear Hiring Manager,\n\nI am writing to apply for the ${role || "[role]"} position at ${company || "[company]"}.${r.summary ? ` ${r.summary}` : ""}\n\n${top ? `My skills include ${top}. ` : ""}${r.experience[0]?.role ? `Most recently I worked as ${r.experience[0].role}${r.experience[0].company ? ` at ${r.experience[0].company}` : ""}. ` : ""}I would welcome the opportunity to discuss how I can contribute to ${company || "your team"}.\n\nThank you for your time and consideration.\n\nSincerely,\n${r.personal.fullName || "[Your name]"}` });
  }
  return (
    <Card className="space-y-3 p-4"><div className="grid gap-3 sm:grid-cols-2"><Input label="Role you are applying for" value={role} onChange={(e) => setRole(e.target.value)} /><Input label="Company" value={company} onChange={(e) => setCompany(e.target.value)} /></div>
      <Button variant="secondary" onClick={draft}>Fill a starting draft from my resume</Button><p className="text-xs text-ink-2">The draft only rearranges what is already in your resume. Edit it freely.</p>
      <Textarea label="Cover letter" rows={14} value={r.coverLetter} onChange={(e) => upd({ coverLetter: e.target.value })} maxLength={4000} />
      <div className="hidden print:block whitespace-pre-line">{r.coverLetter}</div></Card>
  );
}

function AiPanel({ r, upd, enabled }: { r: ResumeInput; upd: (p: Partial<ResumeInput>) => void; enabled: boolean }) {
  const [task, setTask] = useState<"summary" | "bullets" | "cover_letter">("summary"); const [facts, setFacts] = useState(""); const [role, setRole] = useState(""); const [company, setCompany] = useState("");
  const [out, setOut] = useState<any>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function go() {
    setBusy(true); setErr(""); setOut(null);
    try { setOut(await api("/resumes/ai", { body: { task, facts, role, company, name: r.personal.fullName, jobDescription: r.jobDescription.slice(0, 4000) } })); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }
  const text = out ? (out.bullets ? out.bullets.map((b: string) => `- ${b}`).join("\n") : out.text) : "";
  return (
    <Card className="space-y-3 p-4">
      <Alert>{enabled ? "AI drafts wording from the facts you type below – it must not add anything else. Always review it before use." : "AI help is not switched on for this server. Everything else in the builder works without it."}</Alert>
      <Select label="What do you want?" value={task} onChange={(e) => setTask(e.target.value as any)}><option value="summary">A professional summary</option><option value="bullets">Bullet points for a job</option><option value="cover_letter">A cover letter</option></Select>
      <div className="grid gap-3 sm:grid-cols-2"><Input label="Role" value={role} onChange={(e) => setRole(e.target.value)} /><Input label="Company" value={company} onChange={(e) => setCompany(e.target.value)} /></div>
      <Textarea label="Your facts (only these will be used)" rows={5} value={facts} onChange={(e) => setFacts(e.target.value)} maxLength={3000} hint="Avoid sensitive personal details – this text is sent to an AI provider." />
      <Button loading={busy} disabled={!enabled || facts.trim().length < 10} onClick={go}>Draft with AI</Button>
      {err && <Alert tone="warn">{err}</Alert>}
      {out && <div className="space-y-2 rounded-xl border border-brand/30 bg-brand-50 p-3"><Badge tone="brand">AI-generated – review and edit</Badge><p className="whitespace-pre-line text-sm">{text}</p>
        <div className="flex flex-wrap gap-2">{task === "summary" && <Button variant="secondary" onClick={() => upd({ summary: out.text.slice(0, 1200) })}>Use as summary</Button>}{task === "cover_letter" && <Button variant="secondary" onClick={() => upd({ coverLetter: out.text })}>Use as cover letter</Button>}{task === "bullets" && <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(text)}>Copy bullets</Button>}</div></div>}
    </Card>
  );
}
