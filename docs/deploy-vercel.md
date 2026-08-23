# Deploying to Vercel

This repository is an npm workspace monorepo:
- `packages/engine` is built and validated during CI.
- `packages/renderer` is the public web app (Vite build output).

This setup intentionally avoids GitHub Actions for now.

## 1) Create Vercel project

1. In Vercel, create a new project and import this GitHub repository.
2. Keep framework as Vite.
3. Root directory: repository root.
4. Build command: `npm run build`
5. Output directory: `packages/renderer/dist`
6. Install command: `npm ci`

These values are also committed in `vercel.json`.

## 2) Choose one deploy path

### Option A: Vercel Git integration (recommended)

1. In Vercel, import this GitHub repository.
2. Keep build settings from `vercel.json` (or set manually):
   - Install command: `npm ci`
   - Build command: `npm run build`
   - Output directory: `packages/renderer/dist`
3. Set production branch to `main`.

Behavior:
- Push to `main` triggers production deploy in Vercel.
- Pull requests get preview deploys directly from Vercel.

No GitHub workflow file or GitHub PAT workflow scope is required.

### Option B: Manual CLI deploy

Use this when you want to deploy on demand from your machine.

1. Login: `npx vercel login`
2. Link project once in repo root: `npx vercel link`
3. Preview deploy: `npx vercel --prod=false`
4. Production deploy: `npx vercel --prod`

## 3) Local quality check before production deploy

Run:
- `npm ci`
- `npm run test --workspace=packages/engine`
- `npm run build`

## 4) Optional hardening

- Add branch protection on `main` and require PR review.
- Configure custom domain and force HTTPS in Vercel project settings.
- Add Sentry/browser monitoring for runtime client errors.
