# Deploying the API and frontend together (HTTPS, always on)

Target: one Ubuntu VM running `docker compose` with two containers — the API and Caddy (automatic HTTPS,
and the reverse proxy that also serves the frontend's static build). Tested locally: the judge simulator
passes 27/27 through Caddy, oversized bodies still get the API's JSON 413, and a real Vite build served at
`/app/` correctly calls the API at the same origin.

## Routing on the shared domain

| Path | Served by |
|---|---|
| `/app/*` | Frontend static build (`frontend/vite-app/dist/`) |
| everything else (`/predict`, `/batch/jobs`, `/health`, `/demo/`, ...) | The API, unprefixed |

**Do not put the API behind `/api/*` or any other prefix.** The organisers' judging harness calls paths at
the root — `https://<domain>/predict`, not `https://<domain>/api/predict`. Prefixing the API breaks every
judged request. This is why the frontend lives under `/app/` instead: it is the one that needs a prefix, not
the API.

## 1. Server size

| Model shipped | Minimum | Recommended |
|---|---|---|
| TF-IDF + e5-base | 2 vCPU, 4 GB RAM | 2 vCPU, 4 GB |
| TF-IDF + e5-base + XLM-R large (current) | 2 vCPU, 8 GB | **4 vCPU, 8–16 GB** |

Disk: 30 GB. OS: Ubuntu 24.04 LTS. Measure before relying on it: 5,000 tickets must finish well inside 30
minutes (local test on 2 vCPU: 15 minutes).

On Azure: allow inbound **22, 80, 443** in the VM's network settings. Set a **DNS name label** on the
public IP; the hostname becomes `<label>.<region>.cloudapp.azure.com`. **Turn off Auto-shutdown** — some
Azure VMs enable it by default, which would take the API down during the evaluation window.

## 2. Install Docker (on the VM)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
docker compose version
```

## 3. Get the code and the key in place

```bash
git clone https://github.com/dilmani773/tensorforge.git && cd tensorforge
cp .env.example .env
nano .env          # API_KEY=<the key from the organisers>, DOMAIN=<your hostname>
chmod 600 .env
```

The model parts are already in `models/` in the repo, so nothing else is downloaded. `.env` is git-ignored.

## 4. Build the frontend

No Node install needed on the VM:

```bash
./deploy/build-frontend.sh
```

This runs `npm ci && npm run build` inside a throwaway `node:20` container and writes
`frontend/vite-app/dist/`, which Caddy serves at `/app/`. Re-run it any time the frontend changes.

The build always uses `VITE_API_MODE=real` (never ships mock data) and leaves `VITE_API_BASE_URL` unset, so
the deployed app calls whatever origin it is loaded from — correct for `/app/` on the shared domain. Only
set `VITE_API_BASE_URL` if the frontend is ever hosted on a *different* origin from the API.

## 5. Start

```bash
docker compose up -d --build
docker compose logs -f api        # wait for: "model ... loaded in ...s"
```

Check from anywhere:

```bash
curl https://<DOMAIN>/health
```

Open `https://<DOMAIN>/app/` for the frontend. Caddy gets the certificate on the first request; this can
take up to a minute.

## 6. Test like the judges (from a laptop)

```powershell
python scripts/judge_sim.py --url https://<DOMAIN> --key <real key> --job-size 5000
```

Expect 27/27. Note the job time line. While it runs, on the VM: `docker stats --no-stream` (memory, CPU).

## 7. Update to new code, model, or frontend

```bash
git pull
./deploy/build-frontend.sh    # only needed if frontend/ changed
docker compose up -d --build
```

Jobs live in the `jobs` volume and survive rebuilds. A job that was running during a restart ends as
`failed` with `error.code = interrupted`, as the spec requires.

## 8. Keep it alive until the evaluation ends

- Both containers use `restart: unless-stopped`, so they come back after a crash or VM reboot.
- Do not run `docker compose down -v` (`-v` deletes the job and certificate volumes).
- Do not change the API key or the domain after submitting.
- Check `https://<DOMAIN>/health` and `https://<DOMAIN>/app/` once a day.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `/health` returns 503 | Model still loading. Wait, then `docker compose logs api` |
| HTTPS fails, HTTP times out | Ports 80/443 closed in the cloud firewall, or DOMAIN does not resolve to the VM yet |
| Every request is 401 | `API_KEY` missing or wrong in `.env`; after editing run `docker compose up -d` |
| Container restarts in a loop | Out of memory: `docker stats`; use a bigger VM |
| 5,000-ticket job too slow | More vCPUs. `ORT_THREADS=0` already uses every core |
| `/app/` shows a blank page or 404s on assets | Run `./deploy/build-frontend.sh`, confirm `frontend/vite-app/dist/index.html` exists, then `docker compose up -d` to remount it |
| Frontend calls `localhost:8000` instead of the real API | A stale build from before this fix, or `VITE_API_BASE_URL` was set in `.env` by mistake — rebuild with it unset |
