# Flowstate AI integration

Flowstate routes AI text and audio requests through the LiteLLM-compatible gateway. Application code must not call provider APIs directly.

## Required runtime configuration

Configure these environment variable names in the deployment environment without committing their values:

- `LITELLM_BASE_URL` — the reachable LiteLLM base URL.
- `LITELLM_API_KEY` — the gateway credential.
- `AI_MODEL` — the configured chat model alias.
- `AI_TRANSCRIPTION_MODEL` — optional transcription model alias; defaults to `whisper-1`.

If the gateway is not configured, the application returns a clear AI configuration error. It does not silently make a direct provider call.

## Current gateway-backed capabilities

- Evidence tagging and confidence scoring.
- Live-session follow-up questions.
- As-is and to-be maturity drafting.
- Transcript insight extraction.
- Audio transcription.

AI output remains a suggestion. Existing human review and organisation authorization rules remain in force before content affects assessments or recommendations.

## Testing

Tests stub the gateway at the OpenAI-compatible `/v1/chat/completions` or `/v1/audio/transcriptions` boundary. They never require provider credentials or call external model services.
