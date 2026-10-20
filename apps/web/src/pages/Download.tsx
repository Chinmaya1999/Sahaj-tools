import { APP_DOWNLOADS, BRAND } from "@ek/shared";
import { Card, Badge } from "../components/ui";
import { PageHero } from "../components/PageHero";

const file = (name: string) => `${APP_DOWNLOADS.repo}/${name}`;

const APPS = [
  {
    key: "android", icon: "🤖", name: "Android", file: APP_DOWNLOADS.android, cta: "Download APK", note: "Android 7 or newer",
    steps: ["Tap Download APK and open the file when it finishes.", "If Android asks, allow \"Install unknown apps\" for your browser (one time).", "Tap Install, then open Oqzra."],
  },
  {
    key: "windows", icon: "🪟", name: "Windows", file: APP_DOWNLOADS.windows, cta: "Download for Windows", note: "Windows 10 or 11, 64-bit",
    steps: ["Download and run the installer.", "If Windows SmartScreen appears, choose More info, then Run anyway (the app is not code-signed yet).", "Oqzra updates itself after install."],
  },
  {
    key: "ios", icon: "🍎", name: "iPhone & iPad", file: APP_DOWNLOADS.ios, cta: "Download IPA (testers)", note: "iOS 16 or newer, for testers",
    steps: ["This test build is not on the App Store yet, so it is unsigned.", "Install it with a sideloading tool such as AltStore or Sideloadly using your Apple ID.", "Or simply open the website in Safari and use Share → Add to Home Screen."],
  },
] as const;

export default function Download() {
  return (
    <>
      <PageHero eyebrow="Get the app" title={`Download ${BRAND.name} for Android, Windows and iPhone`} sub="The same account and data as the website, plus barcode scanning, printing, saving files and sharing straight from your device. Free to install." />
      <section className="mx-auto max-w-6xl px-4 py-10" aria-labelledby="dl-h">
        <h2 id="dl-h" className="sr-only">Downloads</h2>
        <div className="grid gap-5 md:grid-cols-3">
          {APPS.map((a) => (
            <Card key={a.key} className="flex flex-col p-5">
              <div className="flex items-center gap-3"><span aria-hidden className="text-3xl">{a.icon}</span><div><h3 className="font-sans text-lg font-semibold">{a.name}</h3><p className="text-xs text-ink-2">{a.note}</p></div></div>
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
