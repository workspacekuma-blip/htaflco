# Free backend setup — 8 October 2026

Owner-approved setup: one Render Free web service in Frankfurt and Supabase Free in Htafl's Org. The existing Express API, built-in password authentication and ranking formulas remain in use. There is no separately billed worker or Render database. Brevo Free is approved for verification emails; account activation and delivery remain pending.

Supabase project `htaflco` (`jmzpthvbhnyesbvkxrbc`) is created and healthy in `eu-central-1`. The fresh schema and `api/db/production-access.sql` were applied. All eight application tables have RLS; `anon` and `authenticated` have no table access. Only the separate `htafl_backend` role has application CRUD privileges. It is neither superuser nor an RLS bypass role. Supabase security advisors returned no findings. There are zero hosted members or posts; local QA data was not transferred.

The session pooler shown by this project's Connect dialog is `aws-1-eu-central-1.pooler.supabase.com:5432`, database `postgres`, username `htafl_backend.jmzpthvbhnyesbvkxrbc`. The backend credential and JWT secret are generated separately and stored outside the repository. Do not use a postgres/admin password or a Supabase service key in the app.

Use a URL containing `sslmode=verify-full&sslrootcert=db%2Fsupabase-ca.crt`. `api/db/supabase-ca.crt` is the public CA downloaded from the dashboard's official Supabase S3 bucket. SHA-256 fingerprint: `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`. It is a public trust certificate, not a credential. The Node PostgreSQL client successfully authenticated with certificate and hostname checks enabled. Replace this certificate with the provider-published CA when Supabase rotates it; never disable verification to work around a failed connection.

Render settings:

- Repository `workspacekuma-blip/htaflco`, branch `main`, root directory `api`.
- Runtime Node 22; compute **Free, $0/month**; region Frankfurt.
- Build `npm ci --include=dev && npm run typecheck && npm run build`.
- Start `npm run start:hosted`; health check `/health`; automatic deploys Off.
- Environment: `NODE_ENV=production`, `APP_ORIGIN=https://htaflco.netlify.app`, `TRUST_PROXY=1`, `REQUIRE_VERIFIED_EMAIL=true`, `DATABASE_URL` and `JWT_SECRET` as secrets.
- Configure the verified Brevo sender and `SMTP_URL` using port 2525 with `requireTLS=true` only after activation. Without SMTP, registration is unavailable; existing verification gates stay on.

Free-service constraints: Render sleeps after 15 idle minutes, so rankings stop while asleep and resume on wake; cold starts can take about a minute. No artificial keep-alive traffic is configured. Supabase Free may pause after a week of inactivity, has 500 MB database capacity and does not include automatic backups. No payment method, paid plan, disk, add-on or always-on worker should be added without a separate cost review. Export owner-controlled backups before real community data becomes valuable.

Production picture publishing remains disabled until private storage and unsafe-content scanning are integrated. Privacy, Accessibility and Credits remain placeholders. Do not copy local test users into this project.

Verification: API typecheck, 30 tests with zero skipped, and build pass. The shared-host test checks real PostgreSQL, initial ranking snapshots, 401/403 gates, graceful shutdown and production registration failing closed with no SMTP or token logging. Live Render health, Netlify proxy, HTTPS sessions and real email delivery remain pending until deployment completes.
