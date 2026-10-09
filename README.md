# HTAFL: The Creator Generation (full site)

Two apps in one folder:

- `api/` the backend: accounts, posts, votes, comments, feeds, Featured and Rising ranking, picture upload, email, moderation. **TypeScript, Node.js, Express, PostgreSQL.**
- `web/` the website: the pages visitors see. **TypeScript, React, Next.js, CSS.**

The browser only talks to the website. The website forwards `/api/...` to the backend, so cookies stay on one address and no CORS setup is needed.

## What you need installed
Node.js 20.9 or newer and PostgreSQL. Docker is one way to run PostgreSQL; a local installation also works. The verified frontend uses Next.js 16.4 and React 19.3 after the approved security upgrades; the backend mail transport is Nodemailer 10.0.16. Package lockfiles are committed. An SMTP service is optional for local verification, and S3-compatible storage is needed for pictures.

## Run it locally

```bash
# 1. Backend
cd api
cp .env.example .env            # set JWT_SECRET to a long random string
docker compose up -d            # PostgreSQL, tables created automatically
npm install
npm run dev                     # API on http://localhost:3000

# 2. Ranking worker (second terminal, in api/)
npm run rank                    # recalculates Featured every 5 min, Rising every minute

# 3. Website (third terminal)
cd web
cp .env.local.example .env.local
npm install
npm run dev                     # site on http://localhost:3001
```

Open **http://localhost:3001**. Use this address consistently: `APP_ORIGIN` is exactly `http://localhost:3001`, so writes from `http://127.0.0.1:3001` are rejected by the Origin check. Click "Join The Creator Generation", register, and (with no SMTP set) copy the verification link printed in the API terminal. Keep `REQUIRE_VERIFIED_EMAIL=true` when testing membership gates.

Passwords require at least 10 characters and at most **72 UTF-8 bytes**. Both registration and login reject longer passwords rather than silently truncating them; emoji and some other characters use multiple bytes. Malformed Unicode is also rejected before bcrypt. Existing bcrypt hashes are unchanged. Any account previously created with an oversized password needs an owner-approved recovery/reset process before public launch; password reset is still not implemented.

Opening a valid email verification link also signs in that active account, even in a browser that was signed out. The website refreshes the account before displaying success. Links are consumed once, so reopening a used link cannot create another session. Suspended accounts cannot redeem links. Session cookies retain HttpOnly, SameSite=Lax, a seven-day lifetime and Secure in production; verification responses use `Cache-Control: no-store`.

### PostgreSQL without Docker

Create a development database and a **different** test database, then apply the schema to the development database:

```bash
createdb -U htafl htafl
createdb -U htafl htafl_test
psql -U htafl -d htafl -v ON_ERROR_STOP=1 -f db/schema.sql
```

Run these in `api/` with an existing PostgreSQL role and its password configured. Set `DATABASE_URL` and `TEST_DATABASE_URL` in `api/.env`; use a random JWT secret. The test runner recreates the public schema in the dedicated test database. It refuses a missing test URL, a database name without the `_test` suffix, or the same URL as the application database. Never point it at valuable data.

On this Windows machine, Docker was unavailable. Portable PostgreSQL **17.11** is prepared under `../.local-tools/pg-runtime/`, with development and test databases listening on `127.0.0.1:5432`. Local secrets and database files are outside this repository. To restart the prepared services without reinitializing data:

```powershell
# From htafl-site/
.\scripts\start-local.ps1
```

This machine-specific helper starts hidden background processes and writes logs to `../.local-tools/*.log`. It was run successfully. The API is on port 3000, the web app on 3001, and local S3 test storage on 9000.

**Make Featured and Rising fill in:** only votes from verified accounts at least 24 hours old count. Register a few accounts, vote between them, then run this in the database:

```sql
UPDATE users SET created_at = now() - interval '2 days', email_verified = true
WHERE email IN ('your-local-test-account@example.test');
```

**Make yourself a moderator:** `UPDATE users SET role = 'moderator' WHERE email = 'you@example.com';` then open /admin.

Refresh the website after changing a role so navigation reads the current account. Backend moderation permissions now read the database on each request, including promotion, demotion and suspension; signing in again is not required.

For labelled disposable ranking and pagination data in a local environment only:

```bash
cd api
npx tsx scripts/dev-seed.ts --dev-only
```

The script requires a loopback database, `APP_ORIGIN=http://localhost:3001`, and a non-production environment. It is never imported or run by the application. It creates 11 `Local QA seed` accounts, eight ranking candidates, 18 pagination posts, and trusted votes. All posts are explicitly labelled `LOCAL QA` and disposable. Do not copy the local database or its seed accounts into production.

## Community posts, prompts and notifications

Posts support a heading up to 100 characters, a story up to **10,000 characters** including its starter, and one response label: Encouragement, Constructive feedback, Looking for collaborators or Just sharing. Cards show the heading and first line; the full page contains all the text. Older posts keep their original text and use their pillar/craft as a display heading.

Apply the additive upgrades to an existing installation before deploying the new API:

```bash
cd api
npm run db:upgrade
```

New installations already include these changes in `db/schema.sql`. The upgrades were run against the local database and applied to the existing Supabase project; new tables have RLS and only the dedicated backend role can access them. Existing posts, votes and accounts are retained.

Moderators schedule one prompt per Monday-start UTC week in `/admin`. Future prompts appear automatically during their week; no running scheduler is required. Members choose whether their post responds to the current prompt. `/weekly-prompt` shows its responses. No production prompt or sample story is seeded.

Replies create a durable notification for the post author, excluding self-replies. `/notifications` shows replies, unread state and an optional email preference, off by default. Email contains a link, not the story or reply text. Unsubscribe requires confirmation with a POST and cannot sign a member in. The hosted worker claims jobs safely, retries temporary SMTP failures up to five times and recovers interrupted claims after ten minutes. `REPLY_EMAIL_DAILY_LIMIT` caps reply attempts at 100/day (0 pauses them), leaving Brevo capacity for verification; verification itself has separate existing rate limits. SMTP delivery is at least once: a crash between provider acceptance and recording success can cause a duplicate. Sleeping Render instances delay delivery until they wake.

## Private storage with immediate picture and video publishing

The owner requested removal of media approval on 9 October 2026. Set `MEDIA_REVIEW_MODE=immediate` and the server-only `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. Text-only posts publish immediately; pictures/videos publish after the existing file validation succeeds, without human or AI approval. File validation is not unsafe-content scanning. `S3_PUBLIC_BASE` is not needed for this flow. An unset review mode keeps production uploads disabled. `manual` remains an optional rollback configuration for reviewed publication.

Use a **private** bucket, with a 10 MB provider limit and only `image/jpeg,image/png,image/webp,video/mp4`. The approved bucket is `htafl-media`. Supabase S3 credentials bypass storage RLS and can access every bucket in the project; store them only on the backend. Do not grant anonymous/authenticated bucket policies for this custom-account application. For other S3 providers allow browser PUT from the website origin. CORS is not authorization.

Pictures selected in the browser may be up to 5 MB and are compressed before upload; the API accepts at most 2 MB of picture bytes. Sharp fully decodes/re-encodes still JPEG/PNG/WebP, limits inputs to 16 megapixels and strips metadata. Videos are one MP4 per post, up to 10,000,000 bytes and 30 seconds, at most 4K input. The approved `ffmpeg-static` dependency decodes and converts to H.264/AAC at up to 1280×720, removes metadata and disables external track/network protocols. One video transcode runs at a time, with bounded execution; a busy or failed save keeps the draft for retry.

Upload URLs expire after five minutes and write staging keys only. The server writes a separate private validated object before attachment. Immediate mode attaches the validated media and publishes the post in one database transaction. Failed validation creates no post and retains the draft. Distress flags and the support message remain; members can report published content and moderators can hide or remove it. Direct media GET/HEAD and video range requests re-check database visibility; hiding/deleting a post blocks access without waiting for a signed download URL to expire. The approval queue is hidden in immediate mode. In optional manual mode, media starts pending and the existing moderator approval flow remains available.

The hosted worker removes staging files older than a day and expired unattached/deleted-post objects, retaining attached validated objects. Interrupted processing can retry after five minutes. Supabase has no S3 lifecycle rules; cleanup and rankings pause while Render Free sleeps. Monitor the free storage/egress limits; this is not unlimited video hosting. Existing legacy picture URLs and password hashes are unchanged. See [storage and legacy preparation](api/storage/README.md).

## Legacy local picture setup
1. Create a bucket and an access key with your storage provider.
2. Fill the `S3_*` values in `api/.env`. `S3_PUBLIC_BASE` is the public address the pictures are served from.
3. Add a CORS rule to the bucket allowing `PUT` from your site address, for example:

```json
[{ "AllowedOrigins": ["http://localhost:3001"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 3000 }]
```
The composer shows the picture button once the API reports uploads are on. Pictures are shrunk to a maximum 1200px dimension and converted to JPEG in the browser. The backend uses the approved Sharp dependency to validate file signatures and fully decode still JPEG, PNG and WebP contents, with a **16-megapixel** input limit. It rejects corrupt files, mismatched types, keys owned by another member and input/output exceeding **2,000,000 bytes**. Decoded pictures are resized to at most 1200px, oriented, stripped of embedded metadata and saved as JPEGs. See [Sharp's decoding options](https://sharp.pixelplumbing.com/api-constructor/).

This legacy path is for local compatibility tests only, with an unset review mode and `S3_PUBLIC_BASE`. Its `pictures/` objects are publicly readable in the local emulator. Do not use that bucket policy in production: the private-storage path above keeps every bucket object private and serves published attachments through the API. Existing pre-fix URLs are not migrated, and no automated unsafe-content scanner has been activated.

For this verification, MinIO could not be used: Docker is absent and its official community Windows binary download returned HTTP 410. A loopback-only **S3rver test emulator** is prepared in `../.local-tools/s3/` and started by the Windows helper. The real browser successfully uploaded and displayed a picture through the existing presigned PUT and HeadObject flow. This proves the local flow, not compatibility, policies or scanning on a production storage provider. S3rver's CORS response permits `*`; configure your production bucket to allow your actual website origin. Its credentials are test-only and must never be used for a hosted bucket.

## Turn on email
Set `SMTP_URL` (for example `smtp://user:pass@smtp.yourprovider.com:587`) and `MAIL_FROM` in `api/.env`.
For STARTTLS, include `?requireTLS=true`. Without SMTP, local development prints verification links; production registration returns 503 before creating an account and never prints a verification token. Render Free blocks ports 25, 465 and 587. Brevo Free (300 sends/day) is configured on port 2525, and the owner-approved setup email was delivered. The SMTP key was rotated after accidental exposure; the replacement is saved in Render, with its outbound IP ranges authorized in Brevo. The owner reported successful signup verification; the database confirms an active, verified account, and the browser displayed its signed-in navigation. mail.com remains the contact inbox, not the production SMTP relay. See [backend deployment evidence](verification/BACKEND.md) and [verification sign-in checks](verification/AUTH-VERIFICATION.md).
If configured SMTP fails in production, the request returns 503 rather than claiming delivery succeeded. The created account remains unverified; sign in and resend verification after the provider recovers. Production logs do not include verification links or provider error details.

## Pages in the website
`/` home (weekly top-five slider, Rising, Latest, Browse, post box), `/posts/[id]` (full text, picture/video, votes and comments), `/weekly-prompt`, `/notifications`, `/notifications/unsubscribe`, `/about`, `/join`, `/login`, `/verify`, `/wall` (own published/pending/hidden posts, edit and delete), `/admin` (prompts, reports and distress flags; media approval only in optional manual mode), `/info/privacy`, `/info/accessibility`, `/info/guidelines`, `/info/credits`.

Post text and pictures link to the full post page; vote/report/comment buttons keep their own actions. Hidden, removed and deleted posts cannot be opened through a direct link. The footer uses the owner's supplied Instagram, X (Twitter) and TikTok `@htaflco` profiles. The `NEXT_PUBLIC_*` social variables remain optional overrides.

Feed reads wait for the initial account check, avoiding a discarded anonymous request followed by a second member request. Concurrent reads share a request only for the same viewer and URL; completed responses are never cached. Writes clear pending-read reuse. Account and post reads time out after 75 seconds with recovery messaging, and an HTML proxy/loading response is rejected instead of being treated as saved data. The Render Free cold start can still take about a minute after inactivity; these changes do not make the free backend always on. See [loading and hosting review](verification/POSTS-AND-HOSTING.md).

"On the wall right now" shows **up to five community picks** from posts created in the last seven days. The existing Featured ranking uses trusted up/down votes, Wilson confidence scoring, a minimum voter threshold, one post per author and at most two per craft. It is not a raw upvote-count leaderboard. The separate Featured tab/grid remains removed; Rising is the default tab.

Every Featured computation atomically saves both the current ranking and that week's latest recorded list in `featured_archive`. Weeks start on Monday at 00:00 **UTC**. The current week's list updates; completed weeks remain frozen, so missing Sunday no longer loses the last successful computation. On restart, an older saved snapshot is recovered into its week before replacement. An archive storage failure rolls back the ranking update as well. Weeks with no recorded ranking cannot be reconstructed and are not fabricated. There is no archive browsing section on the website. The existing archive table needs no schema migration for this change.

## Put it on the internet (outline)
- Host `web/` on a Next.js host. Host `api/` on any Node host. Use a managed PostgreSQL database.
- Set on the API: `NODE_ENV=production`, a strong `JWT_SECRET`, `APP_ORIGIN` as your real site address, `TRUST_PROXY=1`, and the database URL. Set on the web app: `API_URL` as your API address.
- Run `npm run rank` separately on an always-on host, or `npm run start:hosted` on the approved single Render Free web instance. The latter starts rankings before accepting traffic and closes the HTTP server, worker and database pool on shutdown.
- Serve everything over HTTPS only.

## Still to do before launch
- **Privacy, Accessibility and Credits pages** are placeholders. The Community Guidelines page is a short draft. Get them written and checked against the rules that apply to your members.
- **Safety:** `api/src/safety.ts` is a crude keyword check. Replace it with a proper classifier and a human review process. The post box shows a gentle message when a post is flagged: add support resources for your members' region (marked with a TODO in `web/components/Composer.tsx`).
- **Media safety:** pictures/videos are validated and require the approved human review. This does not identify unsafe content automatically. Confirm review coverage and handling of reports; review legacy pictures separately.
- **Account data export** and built-in password reset are not included. Video captions/transcripts are not implemented; descriptions and native player controls are available.
- Decide whether under-18s are in scope. That changes sign-up, privacy and safety rules.

## What has and hasn't been verified

The community/media follow-up passed **51 API tests and 12 web tests**, both typechecks and builds, and both dependency audits reported zero known vulnerabilities. It includes 10,000-character boundaries, notification isolation/opt-out, actual local SMTP delivery and retry/budget checks, prompt rollover, private-picture moderation/range access/immutable attachments, and real MP4 conversion with audio, restart recovery and temporary-object cleanup. Six storage integration checks require the prepared local S3 server; none were skipped in this run. See [current community/media evidence](verification/COMMUNITY-MEDIA.md). Earlier verification below is historical.

The post-details/loading follow-up passed **36 API tests and ten web tests**, both typechecks and both builds, then published frontend and backend commit `ec4ee72`. Fresh HTTPS checks through Netlify passed health, Latest, rejected anonymous posting/moderation, Origin rejection and a missing-post response. Local browser checks covered full text, pictures, comments, mobile layout, keyboard focus and social links; the disposable fixture was removed. Public browser verification remained blocked by DNS errors. Details and the Vercel Free assessment are in [verification/POSTS-AND-HOSTING.md](verification/POSTS-AND-HOSTING.md).

Verification was performed on **8 October 2026**, using Node 26.9.0, npm 11.19.1, PostgreSQL 17.11 and the Codex in-app browser. Both apps were installed and actually run. The API `/health` and the website `/api/health` proxy returned `{ "ok": true }`.

```bash
# In api/: requires TEST_DATABASE_URL in .env
npm run typecheck
npm test
npm run build
npm audit --audit-level=low

# In web/
npm run typecheck
npm test
npm run build
npm audit --audit-level=low
```

All commands passed: **31 API tests** (eight original ranking tests, three legacy-audit unit tests and 20 integration tests) and **five web tests**. No tests were skipped during this machine's run. The four storage integration tests are explicitly skipped elsewhere unless `S3_ENDPOINT` names the prepared loopback server on port 9000. The database tests cover concurrent unique votes, switching/removing votes and counters, self-vote rejection, tied and microsecond keyset pagination, membership gates, Origin rejection, author-only changes, ranking exclusions/fairness, current moderator permissions, distress flags, hidden comments, password byte/Unicode boundaries, weekly rollover/restart recovery, archive failure rollback and local picture validation. Production publishing gates and read-only legacy inventory/quarantine preparation passed. All three allowed picture formats were decoded/re-encoded; metadata stripping and staging-link replay without attachment replacement passed. The web tests cover cookies, server errors, proxy failures, network failures and the hosted API configuration guard. The API audit reported zero known vulnerabilities after adding Sharp; the web dependency audit from the preceding verification also reported zero and its dependencies are unchanged.

The real browser passed registration, console-link email verification, logout/login, text and picture posting, the distress support message, own-post vote rejection, up/down/removal, comments visible to two accounts, reporting, author editing and delete confirmation/cancellation, moderator report resolution/hiding/reviewing, Featured/Rising with trusted local votes, Latest pagination and Browse filters. Slider autoplay, pause and manual previous/next controls worked. At a 390px viewport the page had no horizontal overflow; dark mode and visible keyboard focus were checked. A failed save preserved its draft. An intentional API outage displayed a load error and **Try again** recovered after the API restarted. Privacy, Accessibility and Credits remain the requested placeholders.

The hosted API health, security gates, database TLS and running worker have been verified on Render Free and Supabase Free. The setup email was delivered, and the live Netlify homepage/API proxy now return 200; see [backend evidence](verification/BACKEND.md) and [Netlify evidence](verification/NETLIFY.md). Signup verification with the replacement SMTP key, HTTPS member cookies, two-account production flows, a real S3 provider, image scanning, load testing, screen-reader testing, other browsers, forced light/reduced-motion modes and production moderation operations have **not** been verified. Full findings, remaining risks and open decisions are in [verification/REPORT.md](verification/REPORT.md). Local browser screenshots are in [verification/desktop.jpg](verification/desktop.jpg) and [verification/mobile.jpg](verification/mobile.jpg).

## Production preparation and Netlify

Production uploads are disabled unless the owner-approved private manual-review setup is configured. AWS policy templates remain reference material for a different provider; Supabase activation uses its private bucket and server-only S3 credentials. Private quarantine preparation and legacy-password recovery requirements are documented in [api/storage/README.md](api/storage/README.md). The read-only inventory command is npm run legacy:audit in api/. Preparation never updates post URLs or passwords.

The requested Netlify address is https://htaflco.netlify.app. Build settings and the hosted API/database prerequisites are in [verification/NETLIFY.md](verification/NETLIFY.md). Netlify builds refuse a missing or non-HTTPS API_URL rather than publishing a broken localhost proxy. The owner approved Supabase Free and Render Free; current setup and exact commands are in [verification/BACKEND.md](verification/BACKEND.md). No paid backend plan is configured in `render.yaml`.
