# Deployment, backup and rollback

Production runs on one Amazon Linux 2023 EC2 instance with Docker. Everything is deployed by the CI/CD pipeline; nobody needs to log in to the server for a normal release.

| | |
|---|---|
| Website | https://sahaj.cmcloud.online |
| API | https://sahaj.api.cmcloud.online (`/api/health`) |
| Server | EC2 `65.2.170.223`, user `ec2-user`, app files in `/opt/sahaj` |
| Images | Docker Hub `awsmallick1999/sahaj-api` and `awsmallick1999/sahaj-web` (tag = first 12 characters of the git commit) |
| Database | MongoDB Atlas (the Atlas Network Access list must allow the server IP) |

## How it is put together
- **web** container: Caddy. Gets and renews Let's Encrypt certificates for both domains, redirects HTTP to HTTPS (HTTP/2 and HTTP/3), serves the fingerprinted frontend files straight from disk with a one-year cache, and forwards everything else to the API. The API domain redirects non-`/api` URLs to the website.
- **api** container: Node/Express (also serves `index.html` with per-page SEO tags).
- Both run as non-root with a read-only filesystem, all Linux capabilities dropped, `no-new-privileges`, memory limits and rotated logs. Only ports 80 and 443 are published. Secrets live only in `/opt/sahaj/.env` (mode 600), never in images or git.

## The pipeline (`.github/workflows/ci-cd.yml`)
On every pull request and push to `main`, four jobs run **in parallel** (total time is the slowest, about the browser tests):
1. **verify**: typecheck, unit and API tests.
2. **e2e**: Playwright browser tests (browsers and the test MongoDB binary are cached).
3. **security**: `npm audit` (high and above) and gitleaks secret scan.
4. **build**: both images in one cached BuildKit run, Trivy scan (fixable critical CVEs fail the build).

On `main` only, if all four pass, **deploy** runs: push images to Docker Hub, then over SSH the server pulls just the changed layers, starts the new containers, waits for the health check, and **rolls back automatically** if it fails. A final public smoke test (HTTPS health on both domains, page served, HTTP-to-HTTPS redirect) rolls back too if it fails. Production deploys are serialized and never cancelled halfway.

### Secrets (GitHub → Settings → Secrets and variables → Actions)
`DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY` (a **dedicated deploy key**, not your personal `.pem`), `EC2_KNOWN_HOSTS` (pins the server's host key).

The deploy key in `~/.ssh/authorized_keys` is bound to `/opt/sahaj/ci-gate.sh` with `restrict`: it can only run `sync-config`, `deploy <tag>`, `rollback` and `status`. It cannot open a shell or forward ports, so leaking it does not give server access.

## Manual operations (SSH with your own key)
```
ssh -i adihuman.pem ec2-user@65.2.170.223
cd /opt/sahaj
docker compose -f docker-compose.prod.yml ps                 # (needs API_IMAGE/WEB_IMAGE; easier:) docker ps
docker logs -f sahaj-api-1                                   # API logs
./deploy.sh <tag>                                            # deploy any tag that exists on Docker Hub
./deploy.sh "$(cat .previous)"                               # roll back to the previous release
nano .env && ./deploy.sh "$(cat .current)"                   # change an environment variable, then restart with it
```
`deploy/bootstrap-server.sh` rebuilds a fresh instance (Docker, compose, swap, automatic security updates, SSH hardening). After running it, copy `deploy/docker-compose.prod.yml`, `deploy/deploy.sh`, `deploy/ci-gate.sh` and a production `.env` to `/opt/sahaj`, write `awsmallick1999` to `/opt/sahaj/.namespace`, and add the deploy key line to `authorized_keys`.

## Environment variables
See `.env.example`. In production: `NODE_ENV=production`, `WEB_ORIGIN=https://sahaj.cmcloud.online`, `MONGODB_URI`, `SESSION_SECRET`, `DOWNLOAD_SECRET`, `PAYMENT_PROVIDER` (not `sandbox`) + keys, optional `SMTP_URL`, `ADMIN_EMAIL/PASSWORD`, `LLM_*`. Add the payment webhook (payments.md) pointing at `https://sahaj.api.cmcloud.online/api/webhooks/payments`.

## Backups & restore
- Atlas: enable continuous/scheduled **Cloud Backup** (M10+) – M0 free clusters have no automated backups; for M0 schedule `mongodump`:
  `mongodump --uri "$MONGODB_URI" --gzip --archive=backup-$(date +%F).gz`
- Restore: `mongorestore --uri "$TARGET_URI" --gzip --archive=backup-YYYY-MM-DD.gz --drop` into a **staging** database first, point a staging deploy at it and verify login + an invoice before touching production. Do this drill once before launch.
- User-level backup: customers can export JSON (Account → Settings), invoices CSV, inventory CSV, movements CSV.

## Retention (as implemented)
Sessions 14 days (TTL) · reset tokens 30 min (TTL) · webhook event ids 90 days (TTL) · customer content until deleted · orders/payments kept without user link after account deletion · audit log kept (no TTL – add one if your policy requires).

## Rollback
1. Automatic on a failed deploy. Manually: `./deploy.sh "$(cat /opt/sahaj/.previous)"` on the server (the previous images are kept locally), or re-run the workflow on an older commit. The app has no destructive migrations; MongoDB collections are schema-flexible and indexes are additive.
2. If a bad catalog price was set, fix in Admin → Catalog (affects only new orders).
3. If data was damaged, restore from backup into staging, diff, then repair/restore selectively.
