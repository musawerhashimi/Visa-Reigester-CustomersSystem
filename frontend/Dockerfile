# syntax=docker/dockerfile:1
# Build context is frontend/. On Railway set Root Directory to `frontend`.

# --- Stage 1: build the Vite SPA ---
FROM node:22-slim AS build
WORKDIR /app

# Vite reads VITE_* at BUILD time, so the backend URL is baked into the
# bundle. Changing it needs a rebuild, not a restart.
ARG VITE_API_BASE_URL=
ARG VITE_WS_BASE_URL=
ARG VITE_MEDIA_BASE_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_WS_BASE_URL=$VITE_WS_BASE_URL \
    VITE_MEDIA_BASE_URL=$VITE_MEDIA_BASE_URL

COPY package.json package-lock.json ./
RUN npm ci
COPY . ./
RUN npm run build

# --- Stage 2: serve the static files with nginx (no Node in the final image) ---
FROM nginx:alpine
ENV PORT=80
# nginx:alpine's entrypoint runs envsubst over /etc/nginx/templates/*, which
# fills in ${PORT} with whatever the platform injects.
COPY default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
