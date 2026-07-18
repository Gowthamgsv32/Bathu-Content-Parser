# Bathu Content Parser Worker

Cloudflare Worker that holds the Google Gemini credentials server-side and
exposes one endpoint for the Question Generator frontend:

- `POST /generate-questions` — `{ params: { questionsPerPage }, pdfText }` →
  calls Gemini, returns `{ text, finishReason }`. The frontend parses/validates
  the `{ questions: [...] }` JSON and retries as needed.

The API key never touches the frontend bundle — only this Worker sees it.

## Setup

```sh
cd worker
npm install
npx wrangler login

# One key, or a comma-separated list of keys (the worker falls back to the
# next key on a 429 rate-limit or 503 overload).
npx wrangler secret put GEMINI_API_KEY
```

## Local development

```sh
npm run dev
```

Runs on `http://localhost:8787` by default, matching the frontend's default
`VITE_WORKER_URL`.

## Deploy

```sh
npm run deploy
```

Wrangler prints the deployed Worker URL (e.g.
`https://bathu-content-parser.<your-subdomain>.workers.dev`). Set that as the
`VITE_WORKER_URL` repository variable (Settings → Secrets and variables →
Actions → Variables) so the GitHub Pages build points at it.

If you rename the Worker or use a custom domain, update `ALLOWED_ORIGIN` in
`wrangler.toml` to match the origin the frontend is served from.
