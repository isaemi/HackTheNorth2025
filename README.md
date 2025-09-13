HTN2025 Frontend

Overview
- React + Vite + TypeScript + Tailwind frontend with shadcn/ui.
- Backend-ready: supports a dev proxy and environment-configurable API base URL.

Backend Integration
- Dev proxy: Requests to `/api/*` are proxied to `VITE_PROXY_TARGET` during `npm run dev`, and the `/api` prefix is preserved (backend should serve under `/api`).
- Production base URL: By default the app calls `'/api'` relative to the current origin. If your production backend isn’t mounted under `/api`, set `VITE_API_BASE_URL` to the absolute backend URL.

Env Config
- Copy `.env.example` to `.env.local` and adjust values:
  - `VITE_PROXY_TARGET`: e.g., `http://127.0.0.1:5000` (your local backend).
  - `VITE_API_BASE_URL`: absolute API base for production (or leave blank to use `/api`).
  - `VITE_API_TIMEOUT`: request timeout in ms (default 15000).
  - `VITE_API_CREDENTIALS`: `omit` or `include` (cookies with requests).

Usage
- Start backend on your chosen port (e.g., 5000) and serve your endpoints under `/api` (e.g., `/api/cohere`, `/api/martian`).
- Run frontend dev server: `npm run dev`. The frontend calls `/api/*`, Vite proxies to your backend keeping the `/api` prefix.
- In production:
  - If backend is same-origin at `/api`, no extra config is needed.
  - If backend is at a different origin or not under `/api`, set `VITE_API_BASE_URL` to the absolute URL and ensure CORS is configured.

Code Changes
- `vite.config.ts`: adds `server.proxy['/api']` using `VITE_PROXY_TARGET`.
- `src/services/api.ts`: shared Axios instance for API calls.
- `src/pages/PresetWorkout.tsx`: uses API helper (`/cohere` with fallback to `/martian`).
