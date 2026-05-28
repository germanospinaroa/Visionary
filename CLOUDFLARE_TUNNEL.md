# Deprecated

Cloudflare Tunnel is no longer the deployment path for the worker service.

The active production approach is:

- Docker
- Traefik
- existing Docker network `n8n_evoapi`
- public HTTPS on `worker.germanospina.com`

Use [VPS_DEPLOYMENT.md](/config/Visionary/VPS_DEPLOYMENT.md) instead.
