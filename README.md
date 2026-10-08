# HTAFL: The Creator Generation (full site)

Two apps in one folder:

- `api/` the backend: accounts, posts, votes, comments, feeds, Featured and Rising ranking, picture upload, email, moderation. **TypeScript, Node.js, Express, PostgreSQL.**
- `web/` the website: the pages visitors see. **TypeScript, React, Next.js, CSS.**

The browser only talks to the website. The website forwards `/api/...` to the backend, so cookies stay on one address and no CORS setup is needed.

## What you need installed
Node.js 20 or newer, Docker (for PostgreSQL), and VS Code. Optional: an email service (SMTP) and S3-compatible storage (AWS S3, Cloudflare R2 or similar) for sign-up emails and pictures.

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

Open http://localhost:3001. Click "Join The Creator Generation", register, and (with no SMTP set) copy the verification link printed in the API terminal. For quick local testing you can set `REQUIRE_VERIFIED_EMAIL=false` in `api/.env`.

**Make Featured and Rising fill in:** only votes from verified accounts at least 24 hours old count. Register a few accounts, vote between them, then run this in the database:

```sql
UPDATE users SET created_at = now() - interval '2 days', email_verified = true;
```

**Make yourself a moderator:** `UPDATE users SET role = 'moderator' WHERE email = 'you@example.com';` then open /admin.

## Turn on pictures
1. Create a bucket and an access key with your storage provider.
2. Fill the `S3_*` values in `api/.env`. `S3_PUBLIC_BASE` is the public address the pictures are served from.
3. Add a CORS rule to the bucket allowing `PUT` from your site address, for example:

```json
[{ "AllowedOrigins": ["http://localhost:3001"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 3000 }]
```
The composer shows the picture button once the API reports uploads are on. Pictures are shrunk in the browser first. Also add a lifecycle rule to delete uploads never attached to a post.

## Turn on email
Set `SMTP_URL` (for example `smtp://user:pass@smtp.yourprovider.com:587`) and `MAIL_FROM` in `api/.env`.

## Pages in the website
`/` home (slider, Featured, Rising, Latest, Browse, post box), `/about`, `/join`, `/login`, `/verify`, `/wall` (your posts with edit and delete), `/admin` (moderators), `/info/privacy`, `/info/accessibility`, `/info/guidelines`, `/info/credits`.

## Put it on the internet (outline)
- Host `web/` on a Next.js host. Host `api/` on any Node host. Use a managed PostgreSQL database.
- Set on the API: `NODE_ENV=production`, a strong `JWT_SECRET`, `APP_ORIGIN` as your real site address, `TRUST_PROXY=1`, and the database URL. Set on the web app: `API_URL` as your API address.
- Run `npm run rank` as a separate always-on process.
- Serve everything over HTTPS only.

## Still to do before launch
- **Privacy, Accessibility and Credits pages** are placeholders. The Community Guidelines page is a short draft. Get them written and checked against the rules that apply to your members.
- **Safety:** `api/src/safety.ts` is a crude keyword check. Replace it with a proper classifier and a human review process. The post box shows a gentle message when a post is flagged: add support resources for your members' region (marked with a TODO in `web/components/Composer.tsx`).
- **Pictures** are checked for type and size only. Add scanning for unsafe images.
- **Social links:** set `NEXT_PUBLIC_INSTAGRAM_URL`, `NEXT_PUBLIC_X_URL`, `NEXT_PUBLIC_TIKTOK_URL` in `web/.env.local`. The footer icons appear when set.
- **Video** is not included. **Account data export** is not included.
- Decide whether under-18s are in scope. That changes sign-up, privacy and safety rules.

## What has and hasn't been verified
The ranking logic in `api/src/ranking/score.ts` compiles and its 8 unit tests pass (`cd api && npm test`). All other files were checked only for syntax, not run: `npm install` and a database weren't available where this was written. Expect to fix a few small errors on first run. Start with `npm run typecheck` in both folders and send the messages to your developer or back to Claude.
