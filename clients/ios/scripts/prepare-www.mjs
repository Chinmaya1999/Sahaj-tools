// Copies the shared offline/fallback pages into www-build/, filling in the server URL the app is built for.
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const src = fileURLToPath(new URL("../../shared/www/", import.meta.url));
const out = fileURLToPath(new URL("../www-build/", import.meta.url));
const live = (process.env.SAHAJ_URL ?? "https://sahaj.cmcloud.online").replace(/\/?$/, "/");
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
cpSync(src, out, { recursive: true });
for (const f of readdirSync(out)) if (f.endsWith(".html")) writeFileSync(join(out, f), readFileSync(join(out, f), "utf8").replaceAll("{{LIVE_URL}}", live));
console.log("prepared www-build for", live);
