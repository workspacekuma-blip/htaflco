# Netlify deployment

Requested address: https://htaflco.netlify.app

## Preparation verified on 8 October 2026

The verified local Git history was pushed to [workspacekuma-blip/htaflco](https://github.com/workspacekuma-blip/htaflco), preserving the repository's initial commit. Remote main matched local commit `6353375` after the push. No environment secrets, local manifests or QA database files were committed.

The existing Netlify project was inspected after the owner completed sign-in. It still serves the prior deployment from `workspacekuma-blip/HTAFL` at commit `65d179f`. Its saved build settings use base `web`, command `npm run typecheck && npm test && npm run build`, and publish directory `web/.next`. Automatic builds are **Stopped** while verification-email activation and launch checks are pending. This does not take the currently published site offline.

Repository relinking is pending: Netlify combines saving that connection with a final `Deploy htaflco` action. An earlier automatic approval review rejected that submission while there was no hosted API. The API is now live and `API_URL` is saved, but verification email is not activated. The repository connection remains the old `HTAFL` repository; no new frontend version was deployed. After email activation, finish linking `htaflco`, re-enable builds and verify the resulting deployment.

API typecheck, 29 tests (zero skipped), build and dependency audit passed. Web typecheck, five tests and build passed. The added web regression rejects missing, local, insecure, credential-bearing and non-origin API URLs on Netlify builds. Provider-side build/runtime compatibility remains untested until an actual deployment.

The separate legacy audit and quarantine preparation commands also ran against local QA data: 13 bcrypt hashes, no weak/unsupported hashes, two picture posts, one legacy candidate, one prepared copy, zero blocked items, zero post updates and zero password changes. The private manifest is ignored by Git. No production scanner or storage policy was activated.

The root `netlify.toml` builds `web/` using Node 22 and the installed lockfile, runs web typecheck/tests, and publishes `.next`. Netlify's automatic Next.js adapter supplies server rendering and rewrites; do not upload `.next` as a static site or enable static export. See [Netlify Next.js support](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/).

Connect the intended GitHub repository and main branch to the existing Netlify project after signing in. Review its current settings and deployment before replacing anything. Set `API_URL` to the real hosted API HTTPS origin in build environment settings. Rebuild after changing it because the rewrite destination is captured at build time. Never use localhost or a temporary tunnel to this development database.

The owner subsequently approved Render Free and Supabase Free. The hosted API and ranking worker now share one Free web instance at https://htaflco-api.onrender.com, with a fresh Supabase database and restricted backend role. The live health check and public/security gates passed; no QA users or posts were transferred. See [BACKEND.md](BACKEND.md) for setup evidence, commands and free-tier limits.

Netlify's production-only `API_URL` is now saved as https://htaflco-api.onrender.com. Builds and repository relinking remain pending while Brevo Free verification-email activation is unfinished. The old published site remains in place. Preview contexts deliberately have no production API URL and need a separate test backend before use. Production picture publishing remains disabled; see [production storage preparation](../api/storage/README.md).

Before public community activation, verify the live `/api/health` proxy, HTTPS cookies, Origin checks, registration/email verification/login, two-account shared posts/comments/votes, ownership/moderation, ranking worker and rollback. Confirm hosting limits/costs before buying plans or enabling paid services. Privacy, Accessibility and Credits remain placeholders as requested. Production deployment and provider policy enforcement are not claimed until actually performed and checked.
