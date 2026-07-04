# Deploying to EC2 — single box (Option A)

Everything on one EC2 instance: **Next.js** (via `next start` under systemd) +
**nginx** (TLS) + **PostgreSQL in Docker**. Cardholder photos are stored as URLs
and the app writes nothing to disk, so the app layer is stateless — all state
lives in Postgres. **Back up Postgres** (the ledger is append-only money data).

No application code changes are required — production config is all env + infra.

---

## 1. Provision

- **Instance:** `t3.medium` (2 vCPU / 4 GB). `next build` wants ~2 GB; 4 GB is
  comfortable for build + runtime + local Postgres.
- **OS:** Ubuntu 22.04 LTS (these docs assume the `ubuntu` user) or Amazon Linux 2023.
- **Storage:** 30 GB gp3.
- **Region:** closest to the cafeteria (e.g. `ap-south-1` Mumbai — matches `Asia/Kolkata`).
- **Security group inbound:** 443 + 80 from anywhere, 22 from your IP only.
  **Do not** open 5433 — Postgres is bound to `127.0.0.1` and stays internal.

## 2. Install runtime

```bash
# Node 20 LTS (Next 16 needs >=18.18; Prisma 6.5 runs fine on 20) + nginx, git,
# and TLS tooling — all resolvable from the Ubuntu/nodesource repos.
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx git certbot python3-certbot-nginx

# Docker Engine + compose plugin from Docker's OFFICIAL repo.
# (Ubuntu's repos don't carry docker-compose-plugin, and `docker.io` ships no
#  `docker compose` v2 on 22.04 — so add Docker's repo.)
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo usermod -aG docker ubuntu   # log out / back in for the group to apply
```

## 3. Get the code + env

```bash
cd /home/ubuntu
git clone <your-repo-url> mess-management
cd mess-management
npm ci                                   # full install (build needs dev deps)

cp .env.production.example .env          # then edit:
#   - DATABASE_URL password (match step 4)
#   - AUTH_SECRET   ->  openssl rand -base64 32
#   - AUTH_URL      ->  https://<your-subdomain>
#   - AUTH_TRUST_HOST=true  (already set in the template)
```

## 4. Start Postgres (Docker, localhost-only)

```bash
export POSTGRES_PASSWORD='your-strong-password'   # same as in .env DATABASE_URL
docker compose -f deploy/docker-compose.prod.yml up -d
docker exec mess-postgres pg_isready -U mess -d mess_management   # -> accepting
```

## 5. Migrate, seed, build

```bash
npx prisma migrate deploy   # applies committed migrations (NEVER `migrate dev` on prod)
npm run db:seed             # FIRST DEPLOY ONLY — creates Super Admin, roles, rates, settings
npm run build
```

> Re-running the seed on an existing DB will try to recreate the Super
> Admin/roles — run it once. On later deploys, just `migrate deploy` + `build`.

## 6. Run the app under systemd

```bash
sudo cp deploy/mess.service /etc/systemd/system/mess.service
# edit User / WorkingDirectory in the unit if your path/user differ
sudo systemctl daemon-reload
sudo systemctl enable --now mess
curl -s localhost:3000/api/health        # sanity check (app is up)
journalctl -u mess -f                     # live logs
```

## 7. nginx + TLS

nginx won't validate a `listen ... ssl` block until a certificate exists, and
`certbot --nginx` can't run until nginx validates — a chicken-and-egg. So issue
the cert with a temporary HTTP-only config first, then swap in the full TLS
config (this preserves our custom `/sw.js` no-cache + forwarded-header blocks,
which a certbot-generated block would not).

First confirm DNS resolves to this instance: `dig +short <subdomain>`.

```bash
sudo ln -s /etc/nginx/sites-available/mess /etc/nginx/sites-enabled/mess

# 1) Temporary HTTP-only config so nginx validates + can serve the ACME challenge
sudo tee /etc/nginx/sites-available/mess > /dev/null <<'EOF'
server {
    listen 80;
    server_name mess.yourdomain.com;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 200 'ok'; }
}
EOF
sudo nginx -t && sudo systemctl reload nginx

# 2) Obtain the cert via webroot (does not modify the nginx config)
sudo certbot certonly --webroot -w /var/www/html -d mess.yourdomain.com

# 3) Install the real proxy config, then uncomment the two ssl_certificate
#    lines in deploy/nginx.conf (pointing at /etc/letsencrypt/live/<domain>/)
#    and set server_name to your subdomain before copying it in:
sudo cp deploy/nginx.conf /etc/nginx/sites-available/mess
sudo nginx -t && sudo systemctl reload nginx
```

**HTTPS is mandatory** — the counter's offline service worker (`public/sw.js`)
and Auth.js secure cookies will not work over plain HTTP. Renewal is automatic
via `certbot.timer` (`systemctl status certbot.timer`).

## 8. Nightly backups

```bash
chmod +x deploy/backup.sh
# optional offsite: export BACKUP_S3_BUCKET=s3://your-bucket/mess (needs aws cli + IAM role)
crontab -e
#   0 2 * * *  /home/ubuntu/mess-management/deploy/backup.sh >> /var/log/mess-backup.log 2>&1
```

## 9. Scheduled jobs (cron endpoints)

Two endpoints are designed to be hit by the server's scheduler and authenticate
via the `CRON_SECRET` env var (set it in `.env`, then `sudo systemctl restart mess`):

- `POST /api/payments/reconcile` — settles online top-ups whose Jodo redirect
  callback never fired (payer closed the tab / gateway settlement lag). Without
  this, a paid order can sit `pending` forever and its coupons are never
  credited. Idempotent — safe to run every few minutes.
- `POST /api/notifications/digest` — sends the pending notification digest.

```bash
crontab -e
#   */5 * * * *  curl -s -X POST -H "x-cron-secret: <CRON_SECRET>" https://<subdomain>/api/payments/reconcile >> /var/log/mess-reconcile.log 2>&1
#   0 8 * * *    curl -s -X POST -H "x-cron-secret: <CRON_SECRET>" https://<subdomain>/api/notifications/digest > /dev/null 2>&1
```

Each reconcile run logs one JSON line (`{"checked":…,"credited":…}`) — a cheap
audit trail that the sweep is alive. Verify once with `tail /var/log/mess-reconcile.log`.

---

## Redeploying after a code change

```bash
cd /home/ubuntu/mess-management
git pull
npm ci
npx prisma migrate deploy     # if there are new migrations
npm run build
sudo systemctl restart mess
```

## Notes / gotchas

- **`migrate deploy`, never `migrate dev`** on the server — dev tries to create
  new migrations and can prompt/reset.
- **Service worker caching:** nginx serves `/sw.js` with `no-cache` so counter
  clients always pick up the latest. Don't change that.
- **Forwarded headers:** nginx sends `X-Forwarded-Proto/Host`; `AUTH_TRUST_HOST=true`
  makes Auth.js honor them. Both are required behind the proxy.
- **Postgres exposure:** bound to `127.0.0.1:5433`. Keep 5433 closed in the SG.
- **Migrating to RDS later:** zero code changes — `pg_dump | psql` into RDS,
  repoint `DATABASE_URL`, `systemctl restart mess`.
```
