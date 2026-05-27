# Cloudflare Tunnel for `worker.germanospina.com`

This exposes the worker service securely over HTTPS without opening port `80` or configuring Nginx.

Target:

- local worker process on the VPS: `http://localhost:4001`
- public endpoint: `https://worker.germanospina.com`

## 1. Install `cloudflared` on Ubuntu

Use the official Cloudflare package repository:

```bash
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloudflare-main.gpg
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update
sudo apt-get install -y cloudflared
```

Validate:

```bash
cloudflared --version
```

## 2. Authenticate `cloudflared`

Run:

```bash
cloudflared tunnel login
```

This opens a browser and asks you to authorize the VPS against your Cloudflare account and zone.

## 3. Create the tunnel

Example name:

```bash
cloudflared tunnel create visionary-worker
```

This returns a tunnel UUID and creates credentials under:

```bash
~/.cloudflared/<TUNNEL_UUID>.json
```

## 4. Configure the tunnel to point at `localhost:4001`

Copy the template:

```bash
mkdir -p ~/.cloudflared
cp deploy/vps/cloudflared-config.example.yml ~/.cloudflared/config.yml
```

Edit:

```yaml
tunnel: YOUR_TUNNEL_UUID
credentials-file: /home/YOUR_USER/.cloudflared/YOUR_TUNNEL_UUID.json

ingress:
  - hostname: worker.germanospina.com
    service: http://localhost:4001
    originRequest:
      connectTimeout: 30s
      noTLSVerify: true
  - service: http_status:404
```

## 5. Create the DNS route in Cloudflare

Run:

```bash
cloudflared tunnel route dns visionary-worker worker.germanospina.com
```

This creates the required DNS record in Cloudflare automatically.

## 6. Run the tunnel

Foreground test:

```bash
cloudflared tunnel run visionary-worker
```

If you want it persistent as a system service:

```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl restart cloudflared
sudo systemctl status cloudflared
```

## 7. Validate HTTPS

Once both processes are running:

- PM2 worker service on `localhost:4001`
- cloudflared tunnel

check:

```bash
curl https://worker.germanospina.com/health
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

## 8. Update Vercel

Set:

```bash
PILOT_WORKER_API_BASE_URL=https://worker.germanospina.com
```

CLI:

```bash
npx vercel env add PILOT_WORKER_API_BASE_URL production
```

Then redeploy:

```bash
npx vercel --prod
```

## 9. Validate end to end

After the Vercel redeploy:

1. open `https://visual-validator-mvp.vercel.app/pilot`
2. click `Ejecutar piloto`
3. Vercel should call `https://worker.germanospina.com/runs/start`
4. the worker should start Playwright automatically
5. screenshots should begin updating in the Live Browser

## Notes

- This approach does not require opening port `80` or changing your current Nginx setup.
- The worker remains bound to `localhost:4001`.
- Cloudflare provides the public HTTPS edge.
