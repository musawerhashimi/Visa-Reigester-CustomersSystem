#!/usr/bin/env sh
# Deliberately NOT `set -e`. If migrate fails — Postgres not linked yet, say —
# the server must still boot so the healthcheck passes and the real error is
# readable in the logs. Otherwise the platform rolls back with nothing but
# "healthcheck failed" and no explanation.

echo "==> Applying database migrations"
python manage.py migrate --noinput \
  || echo "!! migrate failed — is DATABASE_URL set and Postgres linked? Continuing so logs are reachable."

# Optional first-boot superuser (set both variables to enable).
if [ -n "$DJANGO_SUPERUSER_EMAIL" ] && [ -n "$DJANGO_SUPERUSER_PASSWORD" ]; then
  echo "==> Ensuring superuser $DJANGO_SUPERUSER_EMAIL exists"
  python manage.py createsuperuser --noinput \
    --email "$DJANGO_SUPERUSER_EMAIL" || echo "    (already exists — skipping)"
fi

echo "==> Collecting static files"
python manage.py collectstatic --noinput || echo "!! collectstatic failed — continuing."

# Daphne rather than Gunicorn: this project serves websockets (the live
# notification feed) through Channels, and a WSGI server cannot carry them.
echo "==> Starting Daphne on 0.0.0.0:${PORT:-8000}"
exec daphne -b 0.0.0.0 -p "${PORT:-8000}" visacrm.asgi:application
