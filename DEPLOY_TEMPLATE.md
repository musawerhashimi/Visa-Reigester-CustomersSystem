# Prompt: set up Docker + Railway for this project

Set up this repo for Docker (local) and Railway (production) using the exact
architecture below. It is a proven two-service split: a Django REST backend and
a React/Vite SPA served by nginx, each with its own image, plus Postgres.
Adapt paths/names to this repo, but keep the structure and the reasoning.

## Architecture

Two independent services, two origins, talking over HTTPS via CORS:

    Railway project
      ├── backend   (Root Directory: backend/)   Dockerfile → Django + Gunicorn
      ├── frontend  (Root Directory: frontend/)  Dockerfile → Vite build + nginx
      └── Postgres  (Railway plugin, provides DATABASE_URL)

Key rule: the frontend has NO runtime server-side config. The backend URL is
baked into the JS bundle at build time via a `VITE_API_BASE_URL` build arg.
Changing it requires a rebuild, not a restart.

## Files to create

```
docker-compose.yml          # local mirror of the Railway topology
.env.docker.example         # backend env template (copy to .env)
backend/Dockerfile
backend/.dockerignore
backend/entrypoint.sh
backend/railway.json
frontend/Dockerfile
frontend/.dockerignore
frontend/default.conf.template
frontend/railway.json
```

### backend/Dockerfile

```dockerfile
# syntax=docker/dockerfile:1
# Build context is backend/, so no "backend/" prefix on any path.
# On Railway set this service's Root Directory to `backend`.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    DJANGO_SETTINGS_MODULE=config.settings

WORKDIR /app

# Dependency layer first so code edits don't bust the pip cache.
# psycopg2-binary & Pillow ship manylinux wheels — no compiler needed.
COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY . ./

# Railway injects $PORT at runtime; 8000 is the local default.
# Invoke via `sh` so it works even when a dev bind-mount kills the exec bit.
EXPOSE 8000
ENTRYPOINT ["sh", "/app/entrypoint.sh"]
```

### backend/entrypoint.sh

Deliberately NOT `set -e`. If migrate fails (e.g. Postgres not linked yet),
Gunicorn must still boot so the healthcheck passes and the real error is
visible in logs — otherwise Railway rolls back with a useless
"healthcheck failed" and no explanation.

```sh
#!/usr/bin/env sh
echo "==> Applying database migrations"
python manage.py migrate --noinput \
  || echo "!! migrate failed — is DATABASE_URL set and Postgres linked? Continuing so logs are reachable."

# Optional first-boot superuser (set both env vars to enable).
if [ -n "$DJANGO_SUPERUSER_EMAIL" ] && [ -n "$DJANGO_SUPERUSER_PASSWORD" ]; then
  echo "==> Ensuring superuser $DJANGO_SUPERUSER_EMAIL exists"
  python manage.py createsuperuser --noinput \
    --email "$DJANGO_SUPERUSER_EMAIL" || echo "    (already exists — skipping)"
fi

echo "==> Collecting static files"
python manage.py collectstatic --noinput || echo "!! collectstatic failed — continuing."

echo "==> Starting Gunicorn on 0.0.0.0:${PORT:-8000}"
exec gunicorn config.wsgi:application \
  --bind "0.0.0.0:${PORT:-8000}" \
  --workers "${GUNICORN_WORKERS:-3}" \
  --timeout "${GUNICORN_TIMEOUT:-120}"
```

### backend/railway.json

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": { "builder": "DOCKERFILE", "dockerfilePath": "Dockerfile" },
  "deploy": {
    "healthcheckPath": "/healthz/",
    "healthcheckTimeout": 120,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

### backend/.dockerignore

```
__pycache__/
*.py[cod]
*.egg-info/
.venv/
venv/
.env
db.sqlite3
staticfiles/
media/
*.md
.git
.gitignore
.DS_Store
```

### frontend/Dockerfile (multi-stage: node build → nginx serve)

```dockerfile
# syntax=docker/dockerfile:1
# Build context is frontend/. On Railway set Root Directory to `frontend`.

# --- Stage 1: build the Vite SPA ---
FROM node:22-slim AS build
WORKDIR /app

# Vite reads VITE_* at BUILD time — Railway passes service vars as build args.
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package.json package-lock.json ./
RUN npm ci
COPY . ./
RUN npm run build

# --- Stage 2: serve static files with nginx (no Node in final image) ---
FROM nginx:alpine
ENV PORT=80
# nginx:alpine's entrypoint runs envsubst on /etc/nginx/templates/*, filling ${PORT}.
COPY default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

### frontend/default.conf.template

```nginx
server {
    listen       ${PORT};
    server_name  _;

    root   /usr/share/nginx/html;
    index  index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript
               application/xml text/xml image/svg+xml;
    gzip_min_length 1024;

    # Long-cache the content-hashed Vite assets.
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # SPA fallback: every other route serves index.html (React Router).
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### frontend/railway.json

Same as the backend's but `"healthcheckPath": "/"`.

### frontend/.dockerignore

```
node_modules/
dist/
.vite/
.env
.env.*
!.env.example
*.md
.git
.gitignore
.DS_Store
```

### docker-compose.yml

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-app}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-app}
      POSTGRES_DB: ${POSTGRES_DB:-app}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-app} -d ${POSTGRES_DB:-app}"]
      interval: 5s
      timeout: 5s
      retries: 10
    networks: [app_network]

  backend:
    build: { context: ./backend, dockerfile: Dockerfile }
    env_file: [.env]
    environment:
      # Overrides any DATABASE_URL in .env — points Django at the db service.
      DATABASE_URL: postgres://${POSTGRES_USER:-app}:${POSTGRES_PASSWORD:-app}@db:5432/${POSTGRES_DB:-app}
    volumes:
      - ./backend:/app        # dev convenience; DROP for a true prod image
      - media:/app/media      # persist uploads across restarts
    depends_on:
      db: { condition: service_healthy }
    ports: ["8000:8000"]
    networks: [app_network]

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        VITE_API_BASE_URL: http://localhost:8000   # baked into the bundle
    environment: { PORT: 80 }
    ports: ["8080:80"]
    depends_on: [backend]
    networks: [app_network]

volumes:
  pgdata:
  media:

networks:
  app_network: { driver: bridge }
```

## Required Django settings glue (django-environ)

```python
import environ
env = environ.Env(
    DEBUG=(bool, False),
    SECRET_KEY=(str, "django-insecure-change-me"),
    ALLOWED_HOSTS=(list, ["localhost", "127.0.0.1"]),
    CORS_ALLOWED_ORIGINS=(list, ["http://localhost:5173"]),
)
environ.Env.read_env(BASE_DIR / ".env")

DEBUG = env("DEBUG"); SECRET_KEY = env("SECRET_KEY")
ALLOWED_HOSTS = env("ALLOWED_HOSTS")
CSRF_TRUSTED_ORIGINS = env("CSRF_TRUSTED_ORIGINS", default=[])

# Railway auto-injects these — trust its domains so DEBUG=False doesn't 400.
RAILWAY_PUBLIC_DOMAIN = env("RAILWAY_PUBLIC_DOMAIN", default=None)
if RAILWAY_PUBLIC_DOMAIN:
    ALLOWED_HOSTS.append(RAILWAY_PUBLIC_DOMAIN)
    CSRF_TRUSTED_ORIGINS.append(f"https://{RAILWAY_PUBLIC_DOMAIN}")
if env("RAILWAY_ENVIRONMENT", default=None) or RAILWAY_PUBLIC_DOMAIN:
    ALLOWED_HOSTS += [".railway.app", ".railway.internal"]
    if (priv := env("RAILWAY_PRIVATE_DOMAIN", default=None)):
        ALLOWED_HOSTS.append(priv)

# SQLite for dev, Postgres in prod.
DATABASES = {"default": env.db("DATABASE_URL")} if env("DATABASE_URL", default=None) else {...sqlite...}

STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"
CORS_ALLOWED_ORIGINS = env("CORS_ALLOWED_ORIGINS")
CORS_ALLOW_CREDENTIALS = True

if not DEBUG:
    SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=True)
    SECURE_REDIRECT_EXEMPT = [r"^healthz/?$"]   # probe must not get a 301
    SESSION_COOKIE_SECURE = CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = SECURE_HSTS_PRELOAD = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")  # required behind Railway's proxy
```

Add a dependency-free liveness view (it must not touch the DB):

```python
def healthz(request):
    return HttpResponse("ok", content_type="text/plain")
# urlpatterns += [path("healthz/", healthz)]
```

Frontend API client reads the baked-in value:

```ts
export const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')
```

Backend requirements must include: `gunicorn`, `whitenoise`, `psycopg2-binary`,
`django-environ`, `django-cors-headers`.

## Local run

```
cp .env.docker.example .env      # then set a real SECRET_KEY
docker compose up --build
# frontend → http://localhost:8080    backend/admin → http://localhost:8000
```

## Railway deploy steps

1. New project → add the **Postgres** plugin (gives `DATABASE_URL`).
2. **backend service**: connect the repo, set Root Directory `backend`.
   Variables:
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}` (reference variable)
   - `SECRET_KEY=<long random>`
   - `DEBUG=False`
   - `CORS_ALLOWED_ORIGINS=https://<frontend-domain>`
   - `CSRF_TRUSTED_ORIGINS=https://<frontend-domain>`
   - optional `DJANGO_SUPERUSER_EMAIL` / `DJANGO_SUPERUSER_PASSWORD`
   Generate a public domain.
3. **frontend service**: same repo, Root Directory `frontend`.
   Variable `VITE_API_BASE_URL=https://<backend-domain>` — it is consumed as a
   **build arg**, so after changing it you must redeploy, not restart.
   Generate a public domain.
4. Order matters: deploy backend → copy its domain into the frontend's
   `VITE_API_BASE_URL` → deploy frontend → put the frontend domain back into the
   backend's `CORS_ALLOWED_ORIGINS`/`CSRF_TRUSTED_ORIGINS` → redeploy backend.

## Gotchas this design already handles

- `$PORT`: both services bind Railway's injected port (`${PORT:-8000}` for
  Gunicorn, envsubst into the nginx template).
- Healthcheck vs HTTPS redirect: `/healthz/` is exempt from `SECURE_SSL_REDIRECT`,
  otherwise the probe gets a 301 and the deploy is marked failed.
- Migration failures don't block boot, so you get readable logs instead of a
  silent rollback.
- `ALLOWED_HOSTS` covers `.railway.app` and `.railway.internal`, so private
  networking and the public domain both work with `DEBUG=False`.
- `SECURE_PROXY_SSL_HEADER` is required or Django sees every request as HTTP
  behind Railway's proxy and infinite-redirects.
- Uploaded media on Railway is ephemeral — attach a volume at `/app/media` or
  move to S3/R2 for anything real.

Confirm the plan against this repo's actual layout before writing files, then
create them and verify with `docker compose up --build`.
