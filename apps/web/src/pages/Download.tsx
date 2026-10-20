import { APP_DOWNLOADS, BRAND } from "@ek/shared";
import { Card, Badge } from "../components/ui";
import { LogoMark } from "../components/Logo";
import { PageHero } from "../components/PageHero";

/** Platform logos, drawn as inline SVG so they stay crisp and follow the theme. */
function AndroidLogo({ size = 40 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" className="shrink-0">
      <g fill="#3DDC84">
        <path d="M6 9h12v8.5a1 1 0 01-1 1h-1V22a1.5 1.5 0 01-3 0v-3.5h-2V22a1.5 1.5 0 01-3 0v-3.5H7a1 1 0 01-1-1V9z" />
        <rect x="2.2" y="9" width="2.6" height="7.5" rx="1.3" /><rect x="19.2" y="9" width="2.6" height="7.5" rx="1.3" />
        <path d="M6 8a6 6 0 0112 0H6z" />
      </g>
      <g stroke="#3DDC84" strokeWidth="0.9" strokeLinecap="round"><path d="M8.3 3.2L7.2 1.4" /><path d="M15.7 3.2l1.1-1.8" /></g>
      <circle cx="9.4" cy="5.6" r="0.75" fill="#0b1020" /><circle cx="14.6" cy="5.6" r="0.75" fill="#0b1020" />
    </svg>
  );
}
function WindowsLogo({ size = 40 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" className="shrink-0" fill="#00A4EF">
      <path d="M2 4.6l8.4-1.15v8.05H2z" /><path d="M11.5 3.3L22 1.8v9.7H11.5z" /><path d="M2 12.5h8.4v8.05L2 19.4z" /><path d="M11.5 12.5H22v9.7l-10.5-1.5z" />
    </svg>
  );
}
function AppleLogo({ size = 40 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" className="shrink-0" fill="currentColor">
      <path d="M16.4 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.15-2.8.85-3.5.85-.73 0-1.85-.83-3.05-.8-1.57.02-3.02.91-3.83 2.3-1.63 2.83-.42 7.03 1.17 9.33.78 1.12 1.7 2.38 2.9 2.34 1.17-.05 1.61-.75 3.02-.75 1.4 0 1.8.75 3.03.73 1.25-.02 2.05-1.14 2.81-2.27.9-1.3 1.27-2.56 1.28-2.62-.03-.01-2.45-.94-2.4-3.78z" />
      <path d="M14.1 5.8c.64-.78 1.08-1.86.96-2.94-.93.04-2.05.62-2.71 1.4-.6.69-1.12 1.8-.98 2.86 1.03.08 2.09-.52 2.73-1.32z" />
    </svg>
  );
}
const LOGOS = { android: AndroidLogo, windows: WindowsLogo, ios: AppleLogo } as const;
const file = (name: string) => `${APP_DOWNLOADS.repo}/${name}`;

const APPS = [
  {
    key: "android", name: "Android", file: APP_DOWNLOADS.android, cta: "Download APK", note: "Android 7 or newer",
    steps: ["Tap Download APK and open the file when it finishes.", "If Android asks, allow \"Install unknown apps\" for your browser (one time).", "Tap Install, then open Oqzra."],
  },
  {
    key: "windows", name: "Windows", file: APP_DOWNLOADS.windows, cta: "Download for Windows", note: "Windows 10 or 11, 64-bit",
    steps: ["Download and run the installer.", "If Windows SmartScreen appears, choose More info, then Run anyway (the app is not code-signed yet).", "Oqzra updates itself after install."],
  },
  {
    key: "ios", name: "iPhone & iPad", file: APP_DOWNLOADS.ios, cta: "Download IPA (testers)", note: "iOS 16 or newer, for testers",
    steps: ["This test build is not on the App Store yet, so it is unsigned.", "Install it with a sideloading tool such as AltStore or Sideloadly using your Apple ID.", "Or simply open the website in Safari and use Share → Add to Home Screen."],
  },
] as const;

export default function Download() {
  return (
    <>
      <PageHero eyebrow="Get the app" title={`Download ${BRAND.name} for Android, Windows and iPhone`} sub="The same account and data as the website, plus barcode scanning, printing, saving files and sharing straight from your device. Free to install." art={<div className="flex flex-col items-center gap-5"><LogoMark size={150} /><div className="flex items-center gap-4 text-ink"><AndroidLogo size={34} /><WindowsLogo size={34} /><AppleLogo size={34} /></div></div>} />
      <section className="mx-auto max-w-6xl px-4 py-10" aria-labelledby="dl-h">
        <h2 id="dl-h" className="sr-only">Downloads</h2>
        <div className="grid gap-5 md:grid-cols-3">
          {APPS.map((a) => (
            <Card key={a.key} className="flex flex-col p-5">
              <div className="flex items-center gap-3"><span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-line bg-paper-2 text-ink">{(() => { const L = LOGOS[a.key]; return <L size={34} />; })()}</span><div><h3 className="font-sans text-lg font-semibold">{a.name}</h3><p className="text-xs text-ink-2">{a.note}</p></div></div>
              <a href={file(a.file)} rel="noreferrer" data-download={a.key} className="btn-holo mt-4 inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-semibold">{a.cta}</a>
              <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-ink-2">{a.steps.map((s) => <li key={s}>{s}</li>)}</ol>
            </Card>
          ))}
        </div>
        <Card className="mt-6 p-5 text-sm text-ink-2">
          <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">Prefer no install? <Badge tone="ok">Works in any browser</Badge></p>
          <p className="mt-2">Open Oqzra in Chrome, Edge or Safari and use <b>Install app</b> or <b>Add to Home Screen</b>. You get the same tools with nothing to download.</p>
          <p className="mt-2">Only download apps from this page. Questions? See the <a className="underline" href="/help">help centre</a> or <a className="underline" href="/contact">contact us</a>.</p>
        </Card>
      </section>
    </>
  );
}
