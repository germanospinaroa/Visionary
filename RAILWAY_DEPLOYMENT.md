# Railway Deployment for `worker-service`

This service runs Playwright + Chromium outside Vercel and exposes the persistent Worker API used by `/pilot`.

## What gets deployed

- `worker-service/server.ts`
- `lib/pilot/worker.ts`
- Supabase persistence layer
- OpenAI integration
- Live Browser screenshots uploaded to Supabase Storage

## Required environment variables in Railway

Set these in the Railway service:

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

Notes:

- Railway will also inject `PORT`; the service supports it automatically.
- `PILOT_MAX_CONCURRENT_RUNS` is the basic concurrency limit.
- `PILOT_RUN_TIMEOUT_MS` is the per-run timeout.

## Deploy steps in Railway

### Option A: Railway UI

1. Create a new Railway project.
2. Choose `Deploy from GitHub repo`.
3. Select this repository.
4. Railway will detect `Dockerfile` and build the service from it.
5. Add all required environment variables.
6. Confirm the service exposes `/health`.
7. Deploy.

### Option B: Railway CLI

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

Then set the environment variables either in the Railway dashboard or via CLI:

```bash
railway variables set OPENAI_API_KEY=...
railway variables set NEXT_PUBLIC_SUPABASE_URL=...
railway variables set NEXT_PUBLIC_SUPABASE_ANON_KEY=...
railway variables set SUPABASE_SERVICE_ROLE_KEY=...
railway variables set PILOT_WORKER_API_PORT=4001
railway variables set PILOT_MAX_CONCURRENT_RUNS=2
railway variables set PILOT_RUN_TIMEOUT_MS=900000
railway variables set PILOT_SHUTDOWN_GRACE_MS=10000
```

## Validate the service after deploy

### Healthcheck

Open:

```bash
https://YOUR-RAILWAY-DOMAIN/health
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

### Start endpoint

```bash
curl -X POST https://YOUR-RAILWAY-DOMAIN/runs/start \
  -H "content-type: application/json" \
  -d '{"runId":"YOUR_RUN_ID"}'
```

Expected:

```json
{
  "ok": true,
  "runId": "YOUR_RUN_ID",
  "message": "Piloto aceptado por el servicio operativo."
}
```

## Connect Railway to Vercel

Once Railway gives you a public URL like:

```bash
https://visionary-worker-production.up.railway.app
```

set this variable in Vercel:

```bash
PILOT_WORKER_API_BASE_URL=https://visionary-worker-production.up.railway.app
```

You can set it with Vercel CLI:

```bash
npx vercel env add PILOT_WORKER_API_BASE_URL production
```

or from the Vercel dashboard:

1. Open project settings.
2. Go to Environment Variables.
3. Add `PILOT_WORKER_API_BASE_URL`.
4. Assign it to `Production`.
5. Redeploy Vercel.

## Final end-to-end flow

After Vercel is connected to Railway:

1. Open `https://visual-validator-mvp.vercel.app/pilot`
2. Fill `Survey URL`, `Store Code`, `Validator Code`
3. Click `Ejecutar piloto`
4. Next.js creates the run in Supabase
5. Next.js calls Railway `POST /runs/start`
6. Railway starts Playwright automatically
7. Playwright opens Chromium and begins navigation
8. Screenshots are uploaded to Supabase Storage
9. `/pilot` refreshes the Live Browser image automatically
10. The survey progresses to completion

## Operational notes

- Do not deploy this service on Vercel.
- Railway restart policy is configured in `railway.toml`.
- The service performs dependency checks against Supabase and OpenAI in `/health`.
- The service rejects new runs when concurrency is full.
- Runs are timed out automatically using `PILOT_RUN_TIMEOUT_MS`.
- Structured logs are emitted to stdout/stderr for Railway log inspection.
