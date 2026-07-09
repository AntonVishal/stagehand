# Personalised Job Applier

A DevRel-ready Stagehand + Browserbase demo for discovering job leads, generating
tailored LaTeX application materials, uploading PDFs through Stagehand file
inputs, and stopping at a human review gate before final submit.

## Run

```bash
npm install
npm run dev -- --port 3001
```

Open [http://localhost:3001](http://localhost:3001).

## Discovery Flow

1. Enter a role or search phrase in the textarea, for example `Product Engineer`.
2. Choose job sites with toggles: Ashby, Greenhouse, Lever, Workable, Wellfound.
3. Set the job limit.
4. The app builds targeted queries such as `site:jobs.ashbyhq.com Product Engineer`.
5. It fetches search-result pages, extracts result URLs, dedupes them, and queues
   them in result order.
6. Run each queued URL one by one.
7. Stagehand opens the application page and extracts the JD plus required questions.
8. AI SDK v7 generates custom answers and application material from the extracted
   JD/questions.
9. BasicTeX compiles the generated LaTeX resume and cover letter into PDFs.
10. Stagehand fills the form, uploads the generated resume, and stops at
    `needs_review`.
11. You review the application and explicitly approve final submit.

There are no invented company rows and no scoring step.

## What Works Without Browserbase Keys

- Discover real URLs from targeted search-result pages.
- Generate tailored answers plus resume and cover-letter LaTeX files.
- Compile PDFs with the Homebrew-installed BasicTeX toolchain.
- Move each job to `needs_review` without submitting anything.

## Real Browser Run

Set these in `.env.local`:

```bash
BROWSERBASE_API_KEY=""
BROWSERBASE_PROJECT_ID=""
AI_GATEWAY_API_KEY=""
AI_GATEWAY_BASE_URL="https://ai-gateway.vercel.sh/v1"
AI_GATEWAY_MODEL="openai/gpt-5-mini"
```

`AI_GATEWAY_BASE_URL` is the OpenAI-compatible `/v1` endpoint for Stagehand.
Tailoring uses the AI SDK Gateway provider, which defaults to
`https://ai-gateway.vercel.sh/v4/ai` (override with `AI_GATEWAY_SDK_BASE_URL`).

The runner uses `@browserbasehq/stagehand` from `file:../packages/core`, not the
npm registry package. With credentials configured, the run path opens a
Browserbase session, sends Stagehand model calls through Vercel AI Gateway's
OpenAI-compatible endpoint, fills the form with Stagehand, uploads the generated
resume via `act("upload %resume%...", { variables })`, then stops before final
submit.

Generated runtime state lives in `.job-agent/` and `public/artifacts/`; both are
ignored.
