# System Architecture Reference: os.muze.cl & muzeos.muze.cl

**Target Audience:** AI Agents (System Administrators / DevOps)
**Environment:** Production Server (Contabo)

This document outlines the infrastructure, deployment, and operational procedures for the Muze OS environment, focusing on two main components:
1.  **OpenClaw Agent Backend (`os.muze.cl`)**
2.  **Muze OS Integrated Web UI (`muzeos.muze.cl`)**

---

## 1. Authentication & Connection
**Method:** SSH with `sshpass` (Password Authentication)
**Host IP:** `185.205.244.85`
**User:** `root`
**Password:** `Taekwondo12@@`

**Standard Command Prefix (Agent Execution):**
When executing remote commands as an agent on an external system (e.g., macOS), prepend this to ensure SSH keys and timeouts are managed automatically:

```bash
export PATH=/opt/homebrew/bin:$PATH && sshpass -p 'Taekwondo12@@' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 root@185.205.244.85 "<COMMAND>"
```

---

## 2. Infrastructure Overview

Both systems run as Docker containers on a centralized Ubuntu host, reverse-proxied (and TLS-terminated) externally, likely via Traefik or Coolify Proxy.

### Network
*   **Docker Network:** `coolify` (External)

### Dependencies
*   **Database:** Supabase (External / Managed mapping)
*   **Package Manager:** Validated for Node `npm`/`pm2` in local stacks, but production builds are primarily Dockerized.

---

## 3. Component A: OpenClaw Core (`os.muze.cl`)

This is the cognitive backend and gateway for the AI agent operations.

### Deployment Details
*   **Container Name:** `openclaw-osmuze`
*   **Status/Health Check:** `curl -I https://os.muze.cl` (Expected: HTTP 200)

### File Paths & Volumes
*   **Host Data Mapping:** `/data/openclaw-osmuze/app_data/`
*   **Container Mount Point:** `/home/node/.openclaw`
*   **Main Configuration File:** `/data/openclaw-osmuze/app_data/openclaw.json` (Host path)

### Operational Workflows

**1. Modifying Configuration:**
Changes to the agent's behavior (models, compaction, Telegram tokens, etc.) must be done manually via the host JSON file, followed by a container restart. The internal `openclaw update` or `doctor` tools fail due to missing global node dependencies in the specific base image layer (`not-git-install`).

```python
# Example Python patch to enable compaction.memoryFlush
import json
path = "/data/openclaw-osmuze/app_data/openclaw.json"
with open(path, "r") as f:
    config = json.load(f)

# Modify dict structure
if "agents" in config and "defaults" in config["agents"]:
    config["agents"]["defaults"]["compaction"] = { "memoryFlush": { "enabled": True } }

with open(path, "w") as f:
    json.dump(config, f, indent=2)
```

**2. Applying Configuration:**
```bash
docker restart openclaw-osmuze
```

**3. Inspecting Logs:**
```bash
docker logs openclaw-osmuze --tail 100
```

---

## 4. Component B: Muze OS Integrated (`muzeos.muze.cl`)

This is the frontend React/Vite application serving the Commercial, Operations, and Finance views.

### Deployment Details
*   **Container Name:** `muze-os-integrated`
*   **Git Repository:** `https://github.com/cocacha12/muze-os-integrated` (Branch: `main`)
*   **Status/Health Check:** `curl -I https://muzeos.muze.cl` (Expected: HTTP 200)

### File Paths
*   **Host Base Directory:** `/data/muze-os-integrated`
*   **Frontend Source:** `/data/muze-os-integrated/os-web-reborn` (Vite + React)
*   **Backend Source:** `/data/muze-os-integrated/supabase/functions/muze-os-api` (Serverless Edge Functions / PM2 local wrappers if applicable)
*   **Docker Compose:** `/data/muze-os-integrated/docker-compose.yml`

### Operational Workflows

**1. Standard Update Process (CI/CD Emulation):**
The repository is managed via Git on the host. To apply new code pushed directly to GitHub, run the following sequence:

```bash
cd /data/muze-os-integrated
git fetch origin
# (Optional) Check what changed: git log main..origin/main
git pull
./update-os.sh
```

**What `update-os.sh` does:**
The script uses `docker-compose` (configured with `traefik` labels and the `coolify` network) to:
1.  Run `npm install` and `npm run build` locally inside a node builder image.
2.  Rebuild the `muze-os-integrated-app` Docker image.
3.  Recreate and restart the `muze-os-integrated` container with zero (or minimal) downtime.

**2. Inspecting Logs:**
```bash
docker logs muze-os-integrated --tail 100
```

**3. Common Web UI Modifications:**
Changes to `.jsx` or `.css` files (e.g., `App.jsx`) are handled via the Git lifecycle above. **Do not** modify compiled files in `dist/` directly. If live-patching without a git commit is critically necessary (not recommended due to state desync), you must run `npm run build` inside the `os-web-reborn` directory and recreate the container using `./update-os.sh`.

---

## 5. Security & Edge Cases
*   **Git Dirty States:** If updating Component B fails due to dirty working trees (e.g., someone manually patched a file locally), force a restore before pulling: `git restore . && git pull`.
*   **OpenClaw Parsing Errors:** OpenClaw (`os.muze.cl`) strictly validates `openclaw.json`. Extraneous root keys or malformed structures will hard-crash the gateway parser (`[reload] config change skipped (invalid config)`) or trigger the internal Doctor to abort startup. Always edit safely via validated Python/JS scripts.
