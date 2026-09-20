# syntax=docker/dockerfile:1
# Build context is backend/, so no "backend/" prefix on any path.
# On Railway set this service's Root Directory to `backend`.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    DJANGO_SETTINGS_MODULE=visacrm.settings

WORKDIR /app

# Dependency layer first so code edits don't bust the pip cache.
# psycopg2-binary, Pillow and cryptography ship manylinux wheels — no
# compiler needed in the image.
COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY . ./

# Railway injects $PORT at runtime; 8000 is the local default.
# Invoked via `sh` so it works even when a dev bind-mount drops the exec bit.
EXPOSE 8000
ENTRYPOINT ["sh", "/app/entrypoint.sh"]
