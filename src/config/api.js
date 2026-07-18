// URL of the Cloudflare Worker backend that proxies Gemini for the TNPSC
// parser. Configure via VITE_WORKER_URL (see .env.example); defaults to a
// local worker for development.
export const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://bathu-content-parser.gowthamvenkatasalam33.workers.dev'
