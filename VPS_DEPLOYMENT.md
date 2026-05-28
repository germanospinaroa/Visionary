# VPS Ubuntu Deployment with Docker + Traefik

This is the production path for the persistent Playwright worker on the VPS.

Use:

- Docker
- Docker Compose
- existing Traefik instance
- existing Docker network: `n8n_evoapi`

Do not use:

- PM2
- Nginx
- Cloudflare Tunnel
- Railway

Final target:

- `https://worker.germanospina.com/health`

When this is healthy, Vercel can call:

- `POST https://worker.germanospina.com/runs/start`

and `Ejecutar piloto` from `https://visual-validator-mvp.vercel.app/pilot` will start the worker automatically.

## 1. VPS assumptions

This guide assumes the VPS already has:

- Docker installed
- Docker Compose plugin installed
- Traefik running in Docker
- Traefik listening on ports `80` and `443`
- Let's Encrypt enabled in Traefik
- Docker network `n8n_evoapi` already created and shared with Traefik

## 2. Copy the project to the VPS

Example target:

```bash
mkdir -p /opt/visionary
cd /opt/visionary
git clone https://github.com/germanospinaroa/Visionary.git .
```

For updates later:

```bash
cd /opt/visionary
git pull origin main
```

## 3. Create the production env file

Create:

```bash
cp .env.production.example .env.production
```

Fill at least:

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

## 4. Review the worker compose service

The repo includes:

- `Dockerfile`
- `docker-compose.worker.yml`

The compose file already:

- builds the worker image
- runs the service on internal port `4001`
- sets `restart: always`
- joins the external network `n8n_evoapi`
- exposes Traefik labels for `worker.germanospina.com`
- enables a Docker healthcheck against `/health`

## 5. Start the worker service

From the repo root:

```bash
docker compose -f docker-compose.worker.yml up -d --build
```

If you want to rebuild after changes:

```bash
docker compose -f docker-compose.worker.yml up -d --build --force-recreate
```

## 6. Confirm the container is running

```bash
docker compose -f docker-compose.worker.yml ps
```

Expected service name:

- `worker-service`

Container name:

- `visionary-worker-service`

## 7. Check logs

Live logs:

```bash
docker compose -f docker-compose.worker.yml logs -f worker-service
```

Recent logs only:

```bash
docker logs --tail=200 visionary-worker-service
```

Restart:

```bash
docker compose -f docker-compose.worker.yml restart worker-service
```

Stop:

```bash
docker compose -f docker-compose.worker.yml down
```

## 8. Validate local container health

Check Docker health:

```bash
docker inspect --format='{{json .State.Health}}' visionary-worker-service
```

Test from inside the VPS host:

```bash
curl http://127.0.0.1:4001/health
```

If the service is not bound to the host, test through Docker:

```bash
docker exec visionary-worker-service node -e "fetch('http://127.0.0.1:4001/health').then(async (res) => console.log(await res.text()))"
```

Expected shape:

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

## 9. Confirm Traefik labels are applied

The compose file already includes:

```yaml
labels:
  traefik.enable: "true"
  traefik.docker.network: "n8n_evoapi"
  traefik.http.routers.worker.rule: "Host(`worker.germanospina.com`)"
  traefik.http.routers.worker.entrypoints: "websecure"
  traefik.http.routers.worker.tls.certresolver: "mytlschallenge"
  traefik.http.services.worker.loadbalancer.server.port: "4001"
```

That is what makes Traefik publish:

- `https://worker.germanospina.com`

without Nginx, PM2 or tunnels.

## 10. Validate public HTTPS

Once the container is up and Traefik sees it:

```bash
curl https://worker.germanospina.com/health
```

This must return valid JSON from the worker service.

If it does not:

1. inspect container logs
2. inspect Traefik logs
3. confirm DNS for `worker.germanospina.com` points to the VPS
4. confirm Traefik is attached to `n8n_evoapi`
5. confirm the worker container is attached to `n8n_evoapi`

## 11. Connect Vercel to the VPS worker

In Vercel production variables:

```bash
PILOT_WORKER_API_BASE_URL=https://worker.germanospina.com
```

Then redeploy Vercel:

```bash
npx vercel --prod
```

## 12. Validate end-to-end execution

After the VPS worker and Vercel are both configured:

1. open `https://visual-validator-mvp.vercel.app/pilot`
2. click `Ejecutar piloto`
3. Vercel should create the run
4. Vercel should call `POST /runs/start` on the VPS worker
5. the worker should start Playwright automatically
6. screenshots should begin updating in `Live Browser`

## 13. Operating commands

Build and start:

```bash
docker compose -f docker-compose.worker.yml up -d --build
```

View logs:

```bash
docker compose -f docker-compose.worker.yml logs -f worker-service
```

Restart:

```bash
docker compose -f docker-compose.worker.yml restart worker-service
```

Stop and remove:

```bash
docker compose -f docker-compose.worker.yml down
```

Health:

```bash
curl https://worker.germanospina.com/health
```
