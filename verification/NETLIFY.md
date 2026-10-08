# Netlify deployment

Requested address: https://htaflco.netlify.app

## Preparation verified on 8 October 2026

The verified local Git history was pushed to [workspacekuma-blip/htaflco](https://github.com/workspacekuma-blip/htaflco), preserving the repository's initial commit. Remote main matched local commit `6353375` after the push. No environment secrets, local manifests or QA database files were committed.

The existing Netlify project was inspected after the owner completed sign-in. It still serves the prior deployment from `workspacekuma-blip/HTAFL` at commit `65d179f`. Its saved build settings now use base `web`, command `npm run typecheck && npm test && npm run build`, and publish directory `web/.next`. Automatic builds are **Stopped** while the owner chooses backend hosting. This does not take the currently published site offline.

Repository relinking is pending: Netlify combines saving that connection with a final `Deploy htaflco` action. Automatic approval review rejected that submission because the hosted API is not ready and publication must wait. The repository connection remains the old `HTAFL` repository; no new version was deployed. Once the backend is ready, set `API_URL`, finish linking `htaflco`, re-enable builds and verify the resulting deployment.

API typecheck, 29 tests (zero skipped), build and dependency audit passed. Web typecheck, five tests and build passed. The added web regression rejects missing, local, insecure, credential-bearing and non-origin API URLs on Netlify builds. Provider-side build/runtime compatibility remains untested until an actual deployment.

The separate legacy audit and quarantine preparation commands also ran against local QA data: 13 bcrypt hashes, no weak/unsupported hashes, two picture posts, one legacy candidate, one prepared copy, zero blocked items, zero post updates and zero password changes. The private manifest is ignored by Git. No production scanner or storage policy was activated.

The root `netlify.toml` builds `web/` using Node 22 and the installed lockfile, runs web typecheck/tests, and publishes `.next`. Netlify's automatic Next.js adapter supplies server rendering and rewrites; do not upload `.next` as a static site or enable static export. See [Netlify Next.js support](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/).

Connect the intended GitHub repository and main branch to the existing Netlify project after signing in. Review its current settings and deployment before replacing anything. Set `API_URL` to the real hosted API HTTPS origin in build environment settings. Rebuild after changing it because the rewrite destination is captured at build time. Never use localhost or a temporary tunnel to this development database.

The existing Express server and always-running ranking worker require a Node host and production PostgreSQL. This preparation does not convert them to Netlify Functions or provision a database. Create a fresh production database and apply `api/db/schema.sql`; do not transfer local QA accounts/posts. Set the API's `NODE_ENV=production`, `APP_ORIGIN=https://htaflco.netlify.app`, a new strong `JWT_SECRET`, database URL and appropriate `TRUST_PROXY`. Configure owner-selected SMTP delivery so members can actually verify email. Keep verified-email gates enabled. See the main README for commands and [production storage preparation](../api/storage/README.md) for pending picture activation.

Before public community activation, verify the live `/api/health` proxy, HTTPS cookies, Origin checks, registration/email verification/login, two-account shared posts/comments/votes, ownership/moderation, ranking worker and rollback. Confirm hosting limits/costs before buying plans or enabling paid services. Privacy, Accessibility and Credits remain placeholders as requested. Production deployment and provider policy enforcement are not claimed until actually performed and checked.
