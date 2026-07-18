# Bathu Content Parser

A React (Vite) web app for parsing content into exam-ready JSON. The first
tool is the **TNPSC Parser**, ported from the CA-Admin-Web project: upload a
textbook PDF and let Gemini turn it into TNPSC question JSON, batch by batch,
with per-batch and ZIP downloads.

## Tech stack

- React 19 + React Router (HashRouter, for GitHub Pages)
- Vite 8
- `pdfjs-dist` for in-browser PDF text extraction

## Local development

```bash
npm install
cp .env.example .env.local   # then set VITE_WORKER_URL
npm run dev
```

### TNPSC Parser backend

The TNPSC Parser calls a Cloudflare Worker endpoint (`/generate-tnpsc`) that
proxies Google Gemini. Set `VITE_WORKER_URL` to your deployed worker's URL.
The worker lives in [`worker/`](worker/) in this repo and is deployed
separately (Cloudflare) — see [`worker/README.md`](worker/README.md) for
setup and deploy steps.

## Deployment (GitHub Pages)

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the
app and deploys `dist/` to GitHub Pages.

**One-time setup:** enable Pages in the repo — Settings → Pages → Build and
deployment → Source: **GitHub Actions**. (The `GITHUB_TOKEN` can't enable
Pages automatically, so this first step is manual.) After that, every push to
`main` deploys.

- `vite.config.js` sets `base: '/Bathu-Content-Parser/'` to match the Pages
  sub-path, so make sure the repo name stays `Bathu-Content-Parser`.
- Set the `VITE_WORKER_URL` **repository variable** (Settings → Secrets and
  variables → Actions → Variables) so the deployed build points at your
  worker. Without it the parser falls back to `localhost`.

The site is served at `https://<user>.github.io/Bathu-Content-Parser/`.
