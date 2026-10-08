# Netlify deployment — 8 October 2026

Live address: https://htaflco.netlify.app

The existing Netlify project is now linked to [workspacekuma-blip/htaflco](https://github.com/workspacekuma-blip/htaflco), branch `main`. The previous `workspacekuma-blip/HTAFL` connection has been replaced. Production deployment `6ac797c345f38e3f711f24bd` published commit `15cc5c0` successfully; build time was 31 seconds and total deployment time 32 seconds. Automatic builds and publishing are active. Earlier deployments remain available for rollback in the dashboard.

## Working configuration

- Runtime: **Next.js** selected in Project configuration → Developer settings → Build settings.
- Base directory: `web`; package directory unset because it matches the base.
- Build command: `npm run typecheck && npm test && npm run build`.
- Publish directory: `.next` relative to `web` (the settings summary shows `web/.next`).
- Node version: 22 through the root `netlify.toml`.
- Production-only `API_URL`: `https://htaflco-api.onrender.com`.
- Preview contexts deliberately have no production API URL; use a separate test backend before enabling preview builds.

Next.js rewrites forward `/api/*` to the HTTPS Render API on the site's origin. Rebuild after changing `API_URL`, because Next captures it at build time. The configuration rejects missing, local, insecure, credential-bearing and non-origin API URLs during Netlify builds. Do not upload `.next` as a static site or enable static export. Netlify's Next.js adapter provisions the runtime function and routing; see [provider documentation](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/).

## Fix and verification

The first relinked deployment published raw `.next` files with **zero runtime functions**. Its homepage and `/api/health` both returned 404. Inspection found the Runtime setting was unset. Selecting **Next.js** and deploying without cache fixed the issue: the successful deployment records one function, three redirect rules and one header rule. No frontend redesign or dependency change was needed.

Live HTTP checks now return homepage 200 and `/api/health` 200. In the browser, the homepage loads login/join navigation, the empty community slider, Rising/Latest/Browse views and the real signup form. No fake production members, posts or counts were added. Web typecheck, all five tests and a production build with `NETLIFY=true` and the hosted API URL passed locally. Render separately ran API typecheck/build, reported zero dependency advisories and started the API/ranking worker. The local API suite previously passed all 31 tests with none skipped.

Brevo records the single owner-approved setup email as Delivered. Its replacement SMTP key is stored in Render and the owner-approved Render outbound ranges are authorized in Brevo. Signup verification with that replacement key, HTTPS member cookies, two-account posts/comments/votes, author ownership and production moderation still need the owner's real signup before they can be claimed as verified. Local integration tests do not replace these live checks. See [backend setup and evidence](BACKEND.md).

Production pictures remain disabled until private storage and unsafe-content scanning are integrated. Privacy, Accessibility and Credits remain placeholders as requested. Render/Supabase/Brevo use their approved Free tiers; no paid backend plan, disk or dedicated IP was enabled. Free quotas, cold starts and paused rankings during Render sleep still apply. The Netlify dashboard showed 117 credits remaining before the runtime rebuild; no credit top-up or paid upgrade was purchased.