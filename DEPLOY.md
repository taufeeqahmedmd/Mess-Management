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
# Node 20 LTS (Next 16 needs >=18.18; Prisma 6.5 runs fine on 20)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx git

# Docker + compose plugin
sudo apt-get install -y docker.io docker-compose-plugin
sudo usermod -aG docker ubuntu   # re-login for this to take effect

# TLS tooling (used in step 7, once DNS is live)
sudo apt-get install -y certbot python3-certbot-nginx
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

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/mess
sudo ln -s /etc/nginx/sites-available/mess /etc/nginx/sites-enabled/mess
# edit server_name in the file to your real subdomain
sudo nginx -t && sudo systemctl reload nginx

# Once your subdomain's DNS A record points at this instance's public IP:
sudo certbot --nginx -d mess.yourdomain.com
```

certbot installs the cert, fills in the `:443` ssl lines, and sets up
auto-renewal. **HTTPS is mandatory** — the counter's offline service worker
(`public/sw.js`) and Auth.js secure cookies will not work over plain HTTP.

## 8. Nightly backups

```bash
chmod +x deploy/backup.sh
# optional offsite: export BACKUP_S3_BUCKET=s3://your-bucket/mess (needs aws cli + IAM role)
crontab -e
#   0 2 * * *  /home/ubuntu/mess-management/deploy/backup.sh >> /var/log/mess-backup.log 2>&1
```

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
