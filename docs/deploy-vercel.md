# Deploying to Vercel

This repository is an npm workspace monorepo:
- `packages/engine` is built and validated during CI.
- `packages/renderer` is the public web app (Vite build output).

The deploy pipeline is defined in `.github/workflows/vercel-deploy.yml`.

## 1) Create Vercel project

1. In Vercel, create a new project and import this GitHub repository.
2. Keep framework as Vite.
3. Root directory: repository root.
4. Build command: `npm run build`
5. Output directory: `packages/renderer/dist`
6. Install command: `npm ci`

These values are also committed in `vercel.json`.

## 2) Add required GitHub repository secrets

In GitHub repository settings, add:
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

How to get them:
- `VERCEL_TOKEN`: Vercel account settings -> Tokens -> create token.
- `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`:
  1. Run `npx vercel login`
  2. Run `npx vercel link` in repo root and choose your project.
  3. Read values from `.vercel/project.json` generated locally.

Example `.vercel/project.json` fields:
- `orgId`
- `projectId`

## 3) Deployment behavior

- Pull Request to `main`: preview deployment + PR comment with preview URL.
- Push to `main`: production deployment.
- Manual run: supported via workflow dispatch.

## 4) CI checks before deploy

Workflow runs these before Vercel deploy:
- `npm ci`
- `npm run test --workspace=packages/engine`
- `npm run build`

If checks fail, deploy is blocked.

## 5) Optional hardening

- Add branch protection on `main` requiring the `Vercel Deploy` workflow.
- Configure custom domain and force HTTPS in Vercel project settings.
- Add Sentry/browser monitoring for runtime client errors.
