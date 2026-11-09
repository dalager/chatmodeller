# chatmodeller

Chat-driven form builder. Experiment.

An LLM edits a JSON form definition through tool calls. The form renders next to the chat.

## Run

```bash
cp .env.example .env.local
npm install
npm run dev
```

Requires an OpenAI-compatible endpoint with tool calling.

## Stack

Next.js, Vercel AI SDK, zod, Tailwind.

## Docs

`/architecture` in the running app.
