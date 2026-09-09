# Flowstate AI integration

Flowstate uses direct OpenAI as its initial server-side AI provider. All AI requests are made from server code; provider credentials are never exposed to the browser.

## Required runtime configuration

Configure these environment variable names in the deployment environment without committing their values:

- `OPENAI_API_KEY` — server-only OpenAI credential. Never expose it as a client/public variable.
- `OPENAI_MODEL` — optional model name. Defaults to `gpt-4o-mini` for the initial lightweight setup.
- `OPENAI_BASE_URL` — optional OpenAI-compatible API base URL for tests or compatible deployments. It defaults to `https://api.openai.com`; a trailing slash and optional `/v1` are normalized before Flowstate requests `/v1/chat/completions`.

`AI_MODEL` is supported only as a backward-compatible fallback when `OPENAI_MODEL` is absent. New deployments should set `OPENAI_MODEL` explicitly.

If the OpenAI key or model is missing, AI routes return a truthful HTTP 503 configuration error through their existing error handling. They do not silently use another provider.

## Future LiteLLM option

A LiteLLM-compatible gateway remains available as an explicit future seam, but it is not the default. To select it, set `AI_PROVIDER=litellm` and configure `LITELLM_BASE_URL`, `LITELLM_API_KEY`, and `AI_MODEL`. LiteLLM credentials are used only when that provider is explicitly selected; OpenAI credentials are never sent to LiteLLM, and LiteLLM credentials are never sent to OpenAI.

## Current capabilities

- FlowCoach questions grounded in authorized workspace sources.
- Evidence tagging and confidence scoring.
- Live-session follow-up questions.
- As-is and to-be maturity drafting.
- Transcript insight extraction.
- Audio transcription.

AI output remains a suggestion. Existing human review and organisation authorization rules remain in force before content affects assessments or recommendations.

## File capture configuration

Audio and document capture require a Vercel Blob store and the deployment variable `BLOB_READ_WRITE_TOKEN`. Without it, `POST /api/captured-inputs` returns HTTP 503 before creating a `CapturedInput`; raw capture is not falsely reported as saved. Provision the store and configure the token in the target deployment before validating microphone uploads end to end.

## Testing

Tests stub `fetch` at the provider's OpenAI-compatible `/v1/chat/completions` or `/v1/audio/transcriptions` boundary. They never require provider credentials or call external model services. Live execution requires a real server-side key and model, plus a published client AI agent.
