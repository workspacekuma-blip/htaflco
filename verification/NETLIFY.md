# Netlify deployment

Requested address: https://htaflco.netlify.app

The root `netlify.toml` builds `web/` using Node 22 and the installed lockfile, runs web typecheck/tests, and publishes `.next`. Netlify's automatic Next.js adapter supplies server rendering and rewrites; do not upload `.next` as a static site or enable static export. See [Netlify Next.js support](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/).

Connect the intended GitHub repository and main branch to the existing Netlify project after signing in. Review its current settings and deployment before replacing anything. Set `API_URL` to the real hosted API HTTPS origin in build environment settings. Rebuild after changing it because the rewrite destination is captured at build time. Never use localhost or a temporary tunnel to this development database.

The existing Express server and always-running ranking worker require a Node host and production PostgreSQL. This preparation does not convert them to Netlify Functions or provision a database. Create a fresh production database and apply `api/db/schema.sql`; do not transfer local QA accounts/posts. Set the API's `NODE_ENV=production`, `APP_ORIGIN=https://htaflco.netlify.app`, a new strong `JWT_SECRET`, database URL and appropriate `TRUST_PROXY`. Configure owner-selected SMTP delivery so members can actually verify email. Keep verified-email gates enabled. See the main README for commands and [production storage preparation](../api/storage/README.md) for pending picture activation.

Before public community activation, verify the live `/api/health` proxy, HTTPS cookies, Origin checks, registration/email verification/login, two-account shared posts/comments/votes, ownership/moderation, ranking worker and rollback. Confirm hosting limits/costs before buying plans or enabling paid services. Privacy, Accessibility and Credits remain placeholders as requested. Production deployment and provider policy enforcement are not claimed until actually performed and checked.
