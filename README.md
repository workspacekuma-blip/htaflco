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

## Turn on pictures
1. Create a bucket and an access key with your storage provider.
2. Fill the `S3_*` values in `api/.env`. `S3_PUBLIC_BASE` is the public address the pictures are served from.
3. Add a CORS rule to the bucket allowing `PUT` from your site address, for example:

```json
[{ "AllowedOrigins": ["http://localhost:3001"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 3000 }]
```
The composer shows the picture button once the API reports uploads are on. Pictures are shrunk to a maximum 1200px dimension and converted to JPEG in the browser. The backend uses the approved Sharp dependency to validate file signatures and fully decode still JPEG, PNG and WebP contents, with a **16-megapixel** input limit. It rejects corrupt files, mismatched types, keys owned by another member and input/output exceeding **2,000,000 bytes**. Decoded pictures are resized to at most 1200px, oriented, stripped of embedded metadata and saved as JPEGs. See [Sharp's decoding options](https://sharp.pixelplumbing.com/api-constructor/).

Signed upload links write only random `uploads/` staging keys. The server saves each validated attachment at a fresh `pictures/` key, so reusing or racing a staging upload link cannot overwrite an attached picture. Storage credentials now require server-side `GetObject` as well as `HeadObject` and `PutObject`. In production, keep the bucket private by default and allow public reads only under `pictures/`; staging uploads must remain private. Add lifecycle cleanup for staging uploads and unattached published objects. The local emulator does not enforce production bucket policies. Existing pre-fix picture URLs under `uploads/` are not migrated; replace those disposable QA attachments, or migrate/validate real legacy attachments before launch. No unsafe-content scanning service has been selected or activated.

For this verification, MinIO could not be used: Docker is absent and its official community Windows binary download returned HTTP 410. A loopback-only **S3rver test emulator** is prepared in `../.local-tools/s3/` and started by the Windows helper. The real browser successfully uploaded and displayed a picture through the existing presigned PUT and HeadObject flow. This proves the local flow, not compatibility, policies or scanning on a production storage provider. S3rver's CORS response permits `*`; configure your production bucket to allow your actual website origin. Its credentials are test-only and must never be used for a hosted bucket.

## Turn on email
Set `SMTP_URL` (for example `smtp://user:pass@smtp.yourprovider.com:587`) and `MAIL_FROM` in `api/.env`.

## Pages in the website
`/` home (weekly top-five slider, Rising, Latest, Browse, post box), `/about`, `/join`, `/login`, `/verify`, `/wall` (your posts with edit and delete), `/admin` (moderators), `/info/privacy`, `/info/accessibility`, `/info/guidelines`, `/info/credits`.

"On the wall right now" shows **up to five community picks** from posts created in the last seven days. The existing Featured ranking uses trusted up/down votes, Wilson confidence scoring, a minimum voter threshold, one post per author and at most two per craft. It is not a raw upvote-count leaderboard. The separate Featured tab/grid remains removed; Rising is the default tab.

Every Featured computation atomically saves both the current ranking and that week's latest recorded list in `featured_archive`. Weeks start on Monday at 00:00 **UTC**. The current week's list updates; completed weeks remain frozen, so missing Sunday no longer loses the last successful computation. On restart, an older saved snapshot is recovered into its week before replacement. An archive storage failure rolls back the ranking update as well. Weeks with no recorded ranking cannot be reconstructed and are not fabricated. There is no archive browsing section on the website. The existing archive table needs no schema migration for this change.

## Put it on the internet (outline)
- Host `web/` on a Next.js host. Host `api/` on any Node host. Use a managed PostgreSQL database.
- Set on the API: `NODE_ENV=production`, a strong `JWT_SECRET`, `APP_ORIGIN` as your real site address, `TRUST_PROXY=1`, and the database URL. Set on the web app: `API_URL` as your API address.
- Run `npm run rank` as a separate always-on process.
- Serve everything over HTTPS only.

## Still to do before launch
- **Privacy, Accessibility and Credits pages** are placeholders. The Community Guidelines page is a short draft. Get them written and checked against the rules that apply to your members.
- **Safety:** `api/src/safety.ts` is a crude keyword check. Replace it with a proper classifier and a human review process. The post box shows a gentle message when a post is flagged: add support resources for your members' region (marked with a TODO in `web/components/Composer.tsx`).
- **Pictures** are decoded, validated and re-encoded, but still need an owner-selected unsafe-content scanning process and production storage-policy verification.
- **Social links:** set `NEXT_PUBLIC_INSTAGRAM_URL`, `NEXT_PUBLIC_X_URL`, `NEXT_PUBLIC_TIKTOK_URL` in `web/.env.local`. The footer icons appear when set.
- **Video** is not included. **Account data export** is not included.
- Decide whether under-18s are in scope. That changes sign-up, privacy and safety rules.

## What has and hasn't been verified

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

All commands passed: **24 API tests** (eight original ranking tests plus 16 integration tests) and **four web API-client tests**. No tests were skipped during this machine's run. The three storage integration tests are explicitly skipped elsewhere unless `S3_ENDPOINT` names the prepared loopback server on port 9000. The database tests cover concurrent unique votes, switching/removing votes and counters, self-vote rejection, tied and microsecond keyset pagination, membership gates, Origin rejection, author-only changes, ranking exclusions/fairness, current moderator permissions, distress flags, hidden comments, password byte/Unicode boundaries, weekly rollover/restart recovery, archive failure rollback and local picture validation. All three allowed picture formats were decoded/re-encoded; metadata stripping and staging-link replay without attachment replacement passed. The web tests cover cookies, server errors, proxy failures and network failures. The API audit reported zero known vulnerabilities after adding Sharp; the web dependency audit from the preceding verification also reported zero and its dependencies are unchanged.

The real browser passed registration, console-link email verification, logout/login, text and picture posting, the distress support message, own-post vote rejection, up/down/removal, comments visible to two accounts, reporting, author editing and delete confirmation/cancellation, moderator report resolution/hiding/reviewing, Featured/Rising with trusted local votes, Latest pagination and Browse filters. Slider autoplay, pause and manual previous/next controls worked. At a 390px viewport the page had no horizontal overflow; dark mode and visible keyboard focus were checked. A failed save preserved its draft. An intentional API outage displayed a load error and **Try again** recovered after the API restarted. Privacy, Accessibility and Credits remain the requested placeholders.

SMTP delivery, production hosting/HTTPS cookies, a real S3 provider, image scanning, load testing, screen-reader testing, other browsers, forced light/reduced-motion modes and production moderation operations have **not** been verified. Full findings, remaining risks and open decisions are in [verification/REPORT.md](verification/REPORT.md). Browser screenshots are in [verification/desktop.jpg](verification/desktop.jpg) and [verification/mobile.jpg](verification/mobile.jpg).
