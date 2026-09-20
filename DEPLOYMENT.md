# Deployment

Two independent services on their own origins, talking over HTTPS via CORS,
plus managed Postgres and Redis:

    Railway project
      ├── backend   (Root Directory: backend/)   Dockerfile → Django + Daphne
      ├── frontend  (Root Directory: frontend/)  Dockerfile → Vite build + nginx
      ├── Postgres  (plugin, provides DATABASE_URL)
      └── Redis     (plugin, provides REDIS_URL)

**Key rule:** the frontend has no runtime server-side configuration. The backend
URL is baked into the JavaScript bundle at build time through build args.
Changing it requires a **redeploy**, not a restart.

**Why Daphne and not Gunicorn:** the MIS receives live notifications over a
websocket. A WSGI server cannot carry them, so the backend runs as ASGI. Redis
is what lets those notifications reach every process; with a single process the
in-memory fallback works, but it silently stops working the moment the service
scales beyond one.

## Running it locally

```sh
cp .env.docker.example .env      # then set a real DJANGO_SECRET_KEY
docker compose up --build
```

- frontend → http://localhost:8080
- backend and admin → http://localhost:8000

## Deploying to Railway

Order matters, because each service needs the other's domain.

### 1. Create the project and add the plugins

New project → add **Postgres** and **Redis**. They provide `DATABASE_URL` and
`REDIS_URL` as reference variables.

### 2. Backend service

Connect the repo and set **Root Directory** to `backend`. Variables:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` |
| `DJANGO_SECRET_KEY` | a long random string (see below) |
| `DJANGO_DEBUG` | `False` |
| `CORS_ALLOWED_ORIGINS` | `https://<frontend-domain>` |
| `CSRF_TRUSTED_ORIGINS` | `https://<frontend-domain>` |
| `SITE_URL` | `https://<frontend-domain>` |
| `COMPANY_NOTIFICATION_EMAIL` | optional last-resort inbox (see below) |
| `DJANGO_SUPERUSER_EMAIL` | optional, creates an admin on first boot |
| `DJANGO_SUPERUSER_PASSWORD` | optional, required with the above |

Generate the secret key with:

```sh
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

Generate a public domain for the service.

### 3. Frontend service

Same repo, **Root Directory** `frontend`. Variables:

| Variable | Value |
| --- | --- |
| `VITE_API_BASE_URL` | `https://<backend-domain>/api` |
| `VITE_WS_BASE_URL` | `wss://<backend-domain>` |
| `VITE_MEDIA_BASE_URL` | `https://<backend-domain>` |

All three are consumed as **build args**, so after changing any of them you must
redeploy rather than restart. Note `wss://`, not `https://`, for the websocket.

Generate a public domain.

### 4. Wire the two together

1. Deploy the backend, copy its domain.
2. Put that domain into the frontend's three `VITE_*` variables, deploy it.
3. Put the frontend's domain back into the backend's `CORS_ALLOWED_ORIGINS`,
   `CSRF_TRUSTED_ORIGINS` and `SITE_URL`, then redeploy the backend.

### Where office notifications go

The address is resolved in the order the office can actually change things:

1. The **branch** handling the application (Branches page).
2. The **company address** in MIS → Settings.
3. `COMPANY_NOTIFICATION_EMAIL` from the environment.

The environment comes last on purpose: it only changes by redeploying, so if it
won, the address shown in Settings would look editable while silently having no
effect. Set it as a safety net for a fresh install, then configure the real
addresses in the MIS.

### 5. After the first deploy

- Sign in to `/mis` and set the company name and logo under **Settings**.
- Set an email address on the **General** branch, so office notifications have
  somewhere to go that does not depend on an environment variable.
- Configure SMTP under **Settings → Email**, or per branch under **Branches**.

## Uploaded files need a volume

`MEDIA_ROOT` is on the container filesystem, which Railway discards on every
deploy. **Attach a volume mounted at `/app/media` on the backend service**, or
customer documents, receipts and logos will disappear the next time you ship.

For anything beyond a single machine, move to S3 or R2 instead: a volume is
attached to one instance and does not survive horizontal scaling.

## What this setup already handles

- **`$PORT`** — Daphne binds `${PORT:-8000}`; nginx gets it through envsubst.
- **Healthcheck vs HTTPS redirect** — `/healthz/` is exempt from
  `SECURE_SSL_REDIRECT`. Without that the probe gets a 301 and the deploy is
  marked failed with no useful error. The endpoint touches no database, so a
  database outage does not also destroy the deploy.
- **Migration failures do not block boot** — the entrypoint continues so the
  logs stay reachable instead of rolling back silently.
- **`ALLOWED_HOSTS`** covers `.railway.app` and `.railway.internal`, so the
  public domain and private networking both work with `DEBUG=False`.
- **`SECURE_PROXY_SSL_HEADER`** is set, or Django sees plain HTTP behind the
  proxy and redirects forever.
- **Static files** are served by WhiteNoise, so the admin has its CSS without a
  second web server.
