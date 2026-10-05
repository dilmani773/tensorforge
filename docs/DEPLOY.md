# Deploying the API (HTTPS, always on)

Target: one Ubuntu VM running `docker compose` with two containers, the API and Caddy (automatic HTTPS).
Tested locally: the judge simulator passes 27/27 through Caddy, and oversized bodies still get the API's JSON 413.

## 1. Server size

| Model shipped | Minimum | Recommended |
|---|---|---|
| TF-IDF + e5-base | 2 vCPU, 4 GB RAM | 2 vCPU, 4 GB |
| TF-IDF + e5-base + XLM-R large | 2 vCPU, 8 GB | **4 vCPU, 8–16 GB** (XLM-R large is ~3x slower per ticket) |

Disk: 30 GB. OS: Ubuntu 24.04 LTS. Measure before choosing: 5,000 tickets must finish well inside 30 minutes.

On Azure: VM size B2s (2 vCPU / 4 GB) or B4ms (4 vCPU / 16 GB). In the VM's network settings allow inbound
**22, 80, 443**. On the public IP resource set a **DNS name label**; the hostname becomes
`<label>.<region>.cloudapp.azure.com`. **Turn off Auto-shutdown** (Azure enables it on some VMs by default),
or the API goes down at night during the evaluation window.

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

The model parts are in `models/` in the repo, so nothing else is downloaded. `.env` is git-ignored.

## 4. Start

```bash
docker compose up -d --build
docker compose logs -f api        # wait for: "model ... loaded in ...s"
```

Check from anywhere:

```bash
curl https://<DOMAIN>/health
```

Caddy gets the certificate on the first request; this can take up to a minute.

## 5. Test like the judges (from a laptop)

```powershell
python scripts/judge_sim.py --url https://<DOMAIN> --key <real key> --job-size 5000
```

Expect 27/27. Note the job time line. While it runs, on the VM: `docker stats --no-stream` (memory, CPU).

## 6. Update to a new model or code

```bash
git pull
docker compose up -d --build
```

Jobs live in the `jobs` volume and survive rebuilds. A job that was running during a restart ends as
`failed` with `error.code = interrupted`, as the spec requires.

## 7. Keep it alive until the evaluation ends

- Both containers use `restart: unless-stopped`, so they come back after a crash or VM reboot.
- Do not run `docker compose down -v` (`-v` deletes the job and certificate volumes).
- Do not change the API key or the domain after submitting.
- Check `https://<DOMAIN>/health` once a day.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `/health` returns 503 | Model still loading. Wait, then `docker compose logs api` |
| HTTPS fails, HTTP times out | Ports 80/443 closed in the cloud firewall, or DOMAIN does not resolve to the VM yet |
| Every request is 401 | `API_KEY` missing or wrong in `.env`; after editing run `docker compose up -d` |
| Container restarts in a loop | Out of memory: `docker stats`; use a bigger VM |
| 5,000-ticket job too slow | More vCPUs. `ORT_THREADS=0` already uses every core |
