# Environment Variable Inventory (Redacted)

Variable **names only** — no values. Extracted from the local `.env` and `.env.local` files (both git-ignored, identical key sets as of 2026-08-19). Do not commit actual values to this file or anywhere else in the repo.

## Database / Prisma
- `DATABASE_URL`
- `DIRECT_URL`

## Supabase
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, never expose to the client bundle.

## Build tooling (Nx / Turbo)
- `NX_DAEMON`
- `TURBO_CACHE`
- `TURBO_DOWNLOAD_LOCAL_ENABLED`
- `TURBO_REMOTE_ONLY`
- `TURBO_RUN_SUMMARY`

## Vercel platform (auto-injected at build/runtime, not user-set)
- `VERCEL`
- `VERCEL_ENV`
- `VERCEL_TARGET_ENV`
- `VERCEL_URL`
- `VERCEL_OIDC_TOKEN`
- `VERCEL_GIT_PROVIDER`
- `VERCEL_GIT_REPO_ID`
- `VERCEL_GIT_REPO_OWNER`
- `VERCEL_GIT_REPO_SLUG`
- `VERCEL_GIT_COMMIT_REF`
- `VERCEL_GIT_COMMIT_SHA`
- `VERCEL_GIT_PREVIOUS_SHA`
- `VERCEL_GIT_COMMIT_MESSAGE`
- `VERCEL_GIT_COMMIT_AUTHOR_NAME`
- `VERCEL_GIT_COMMIT_AUTHOR_LOGIN`
- `VERCEL_GIT_PULL_REQUEST_ID`

## Microsoft 365 readiness boundary

The SharePoint readiness endpoint checks these non-secret Microsoft Entra settings by name only:
- `MICROSOFT_ENTRA_CLIENT_ID`
- `MICROSOFT_ENTRA_TENANT_ID`
- `MICROSOFT_ENTRA_REDIRECT_URI`
- `MICROSOFT_ENTRA_SCOPES` (optional; space-delimited, defaults to the least-privilege `User.Read`)

The Connect boundary now creates a cryptographically random, 10-minute state value, binds it to a secure HttpOnly SameSite cookie, and returns only a Microsoft authorize URL when all required non-secret settings are present. It does not exchange codes, persist tokens, or claim a connected state. OAuth callback validation and reviewed encrypted token storage are the next slice. Sync remains disabled until that work is verified.

No OAuth client secret, token, tenant connection, or encrypted secret reference is configured by this slice.

## Where to get real values

- Local dev: pull from Vercel with `vercel env pull` (requires `vercel link` + project access), or request `.env.local` directly from the outgoing team.
- Production/preview: managed in the Vercel project's Environment Variables settings (`vercel env ls`).
- Supabase keys: Supabase project dashboard → Settings → API.

No secret values were read, printed, or copied as part of producing this inventory.
