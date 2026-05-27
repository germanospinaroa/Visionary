# VPS Ubuntu Deployment for `worker-service` on Hostinger

This guide deploys the persistent Playwright worker on an Ubuntu VPS using:

- Node.js LTS
- Playwright Chromium
- PM2
- Nginx reverse proxy
- a dedicated subdomain such as `worker.tudominio.com`

The final goal is:

- `https://visual-validator-mvp.vercel.app/pilot`
- click `Ejecutar piloto`
- Vercel calls the VPS worker API
- the worker starts Playwright automatically
- screenshots update in the Live Browser

## 1. DNS / domain

Create a subdomain in Hostinger DNS:

- `worker.tudominio.com` -> VPS public IP

Use this subdomain for the worker API.

## 2. Copy the app to the VPS

Recommended target directory:

```bash
/var/www/visionary
```

Example:

```bash
sudo mkdir -p /var/www/visionary
sudo chown -R $USER:$USER /var/www/visionary
cd /var/www/visionary
git clone <TU_REPO_GIT> .
```

## 3. Bootstrap Ubuntu

Run:

```bash
chmod +x deploy/vps/setup-ubuntu.sh
APP_DIR=/var/www/visionary ./deploy/vps/setup-ubuntu.sh
```

This installs:

- Node.js 22.x
- PM2
- Nginx
- Playwright Chromium + system dependencies

## 4. Production environment file

Create:

```bash
cp .env.production.example .env.production
```

Fill:

```bash
OPENAI_API_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
PILOT_WORKER_API_PORT=4001
PILOT_MAX_CONCURRENT_RUNS=2
PILOT_RUN_TIMEOUT_MS=900000
PILOT_SHUTDOWN_GRACE_MS=10000
```

## 5. Start the worker with PM2

The repo already includes:

- `ecosystem.config.cjs`

Start it:

```bash
cd /var/www/visionary
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Run the command printed by `pm2 startup` so PM2 survives VPS reboots.

## 6. Check logs

PM2 logs:

```bash
pm2 logs visionary-worker-service
```

Status:

```bash
pm2 status
```

Restart manually:

```bash
pm2 restart visionary-worker-service
```

## 7. Validate local healthcheck before Nginx

On the VPS:

```bash
curl http://127.0.0.1:4001/health
```

Expected:

```json
{
  "ok": true,
  "activeRuns": 0,
  "maxConcurrentRuns": 2,
  "dependencies": {
    "supabase": "ok",
    "openai": "ok"
  }
}
```

You can also use:

```bash
npm run pilot:service:health
```

## 8. Configure Nginx reverse proxy

Copy the provided template:

```bash
sudo cp deploy/vps/nginx-worker.conf /etc/nginx/sites-available/visionary-worker
```

Edit:

```nginx
server_name worker.tudominio.com;
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/visionary-worker /etc/nginx/sites-enabled/visionary-worker
sudo nginx -t
sudo systemctl reload nginx
```

## 9. Enable HTTPS

Recommended with Certbot:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d worker.tudominio.com
```

After this, validate:

```bash
curl https://worker.tudominio.com/health
```

## 10. Connect Vercel to the VPS worker

In Vercel Production environment variables, set:

```bash
PILOT_WORKER_API_BASE_URL=https://worker.tudominio.com
```

CLI option:

```bash
npx vercel env add PILOT_WORKER_API_BASE_URL production
```

Then redeploy Vercel:

```bash
npx vercel --prod
```

## 11. Validate the full chain

### From Vercel to VPS

After redeploy, the `/pilot` page will call:

```bash
POST https://worker.tudominio.com/runs/start
```

### Direct endpoint test

```bash
curl -X POST https://worker.tudominio.com/runs/start \
  -H "content-type: application/json" \
  -d '{"runId":"TEST_RUN_ID"}'
```

### Live Browser expectation

When a real run starts:

- Playwright launches on the VPS
- screenshots upload to Supabase Storage
- `survey_runs.current_screenshot_*` updates
- `/pilot` refreshes the image automatically

## 12. Regular deployment updates

For later updates on the VPS:

```bash
chmod +x deploy/vps/deploy-worker.sh
APP_DIR=/var/www/visionary BRANCH=main ./deploy/vps/deploy-worker.sh
```

## 13. Operational notes

- PM2 provides auto-restart.
- Nginx provides stable public routing.
- `/health` verifies service status plus Supabase/OpenAI connectivity.
- run timeout is controlled by `PILOT_RUN_TIMEOUT_MS`.
- concurrency is limited by `PILOT_MAX_CONCURRENT_RUNS`.
- structured logs are emitted to stdout/stderr and visible in PM2 logs.

## 14. What must be true for `Ejecutar piloto` to work

All of these must be correct:

1. VPS worker is running under PM2
2. `https://worker.tudominio.com/health` returns `ok: true`
3. Vercel has `PILOT_WORKER_API_BASE_URL=https://worker.tudominio.com`
4. Vercel is redeployed after setting the variable
5. Supabase and OpenAI variables are valid on the VPS

Once those are satisfied, `Ejecutar piloto` from Vercel will start the worker automatically.
