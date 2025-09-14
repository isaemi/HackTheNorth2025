HTN 2025 — AI Fitness Coach (Frontend)

Overview
- React + Vite + TypeScript + Tailwind with shadcn/ui components.
- Real‑time form scoring using MediaPipe Pose with a hybrid similarity engine (angles + bone orientation + pose embedding), color‑coded skeleton overlay, and visibility guidance.
- Two flows: Preset Workout generation and Rehab Plan generation; both drive a guided Workout Session with per‑exercise timers and scoring.
- Backend‑ready: development proxy for `/api/*` and environment‑configurable API base for production deployments.

Quick Start
- Prereqs: Node 18+ and npm 9+.
- Install: `npm install`
- Configure env: copy `.env.example` to `.env.local` and adjust values (see Env section).
- Run dev server: `npm run dev` then open the printed URL.
- Run a backend on `VITE_PROXY_TARGET` that serves the expected `/api` routes (see Backend API).

Environment
- `VITE_PROXY_TARGET`: Dev proxy target for `/api/*` during `npm run dev` (e.g., `http://127.0.0.1:8000`). The `/api` prefix is preserved.
- `VITE_API_BASE_URL`: Absolute API base in production. Leave blank to use same‑origin `/api`.
- `VITE_API_TIMEOUT`: Request timeout in ms. Default 15000–60000 depending on code path.
- `VITE_API_CREDENTIALS`: `omit` or `include` to control cookies on requests.
- `VITE_ELEVENLABS_API_KEY` (optional): Enables voice prompts via ElevenLabs. If absent, voice is skipped.

Scripts
- `npm run dev`: Start Vite dev server on port 8080 with `/api` proxy.
- `npm run build`: Production build to `dist/`.
- `npm run build:dev`: Development build with non‑minified output.
- `npm run preview`: Preview the production build locally.
- `npm run lint`: Run ESLint.

Backend API (expected)
- Base path: `/api` in dev and same‑origin production, or `VITE_API_BASE_URL` when set.
- Endpoints used by the app:
  - `POST /api/workouts/generate`
    - Request: `{ level, category, style, duration, injuries? }`
    - Response shape used in UI:
      - `{ workoutName: string, totalDuration: string, exercises: Array<{ name: string, duration: string, description: string, difficulty: string, modifications?: string[] }>, reasoning?: string }`
  - `POST /api/rehab/generate`
    - Request: `{ areas: string[], painTypes: string[], intensity: number, onset: string, duration?: string, aggravators?: string[], relievers?: string[], goals?: string, notes?: string }`
    - Response: same workout shape as above (optionally includes `reasoning` used in the session header).
  - `GET /api/poses/search?name={exerciseName}`
    - Response: array of best matches. First item used, e.g. `[ { pose_id: string, score?: number }, ... ]`.
  - `GET /api/poses/:pose_id`
    - Response (template JSON used for scoring):
      - `{ pose_id: string, camera_view?: "front"|"left"|"right"|"side", angles_deg: Record<string,number>, tolerance_deg: Record<string,number>, weights: Record<string,number>, landmarks?: Record<string,{x:number,y:number}> | Array<{x:number,y:number}> }`
  - `GET /api/poses/:pose_id/overlay`
    - Binary image used as an optional template overlay.

Development Notes
- Camera access: the app asks for camera permission and uses MediaPipe Pose for real‑time inference and scoring. On production, serve over HTTPS so browsers allow camera use.
- Proxy behavior: in dev, requests to `/api/*` are proxied to `VITE_PROXY_TARGET` without rewriting the path. Your backend should serve under `/api` in dev for zero config.
- CORS: if you deploy backend on a different origin in production and set `VITE_API_BASE_URL`, configure CORS accordingly on the backend.
- Voice prompts: `src/utils/speak.ts` uses ElevenLabs via `src/services/elevenlabs.ts`. If the key is missing, audio prompts are skipped; the app still works.
- Mock harness: `mock_test/live_scoring_test.html` is a standalone page to experiment with MediaPipe templates and live scoring outside the React app. Open it directly in a browser to use.

Project Structure
- `src/pages`
  - `Index.tsx`: Landing page, entry for Preset Workout and Rehab flows.
  - `PresetWorkout.tsx`: Collects preferences, calls `/workouts/generate`, stores plan.
  - `Rehab.tsx`: Collects symptoms, calls `/rehab/generate`, stores plan.
  - `WorkoutSession.tsx`: Camera pipeline, template/overlay display, per‑exercise timer, hybrid scoring and feedback, end‑of‑session summary.
- `src/context/WorkoutContext.tsx`: Keeps the current plan and camera permission helpers.
- `src/services`
  - `api.ts`: Shared Axios instance configured via env.
  - `rehab.ts`: Thin client for rehab generation.
  - `elevenlabs.ts`: Optional text‑to‑speech.
- `src/components/ui`: shadcn/ui building blocks.
- `vite.config.ts`: Path alias `@` → `src`, dev proxy for `/api`.

Build & Deploy
- Build: `npm run build` → static assets in `dist/`.
- Serve: host `dist/` on any static host (e.g., Nginx, Vercel, Netlify). If your backend is same‑origin at `/api`, no extra config. Otherwise set `VITE_API_BASE_URL` to your backend URL at build time and ensure CORS.

Troubleshooting
- 404s on API calls in dev: confirm your backend serves under `/api` and `VITE_PROXY_TARGET` points to it.
- Camera blocked: check browser permissions and HTTPS; see in‑app toast guidance.
- Pose templates not loading: ensure `/api/poses/search` returns at least one match and `/api/poses/:pose_id` returns the expected JSON shape.
- No audio: verify `VITE_ELEVENLABS_API_KEY`; otherwise ignore, it’s optional.

Acknowledgements
- MediaPipe Pose for landmark detection and pose graph.
- shadcn/ui, Radix UI, Tailwind CSS for UI.
- ElevenLabs (optional) for TTS.

License
- This repository does not include a license file. If you plan to open‑source, add an appropriate license.
