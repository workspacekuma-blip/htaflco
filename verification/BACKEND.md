# Free backend setup — 8 October 2026

Owner-approved setup: one Render Free web service in Frankfurt and Supabase Free in Htafl's Org. The existing Express API, built-in password authentication and ranking formulas remain in use. There is no separately billed worker or Render database. Brevo Free is approved for verification emails; account activation and delivery remain pending.

Brevo dashboard check on 8 October: the Free allowance is 300 emails per day; sender `Htafl <workspacekuma@gmail.com>` is verified. SMTP server is `smtp-relay.brevo.com`, with a provider-assigned SMTP login. Use port 2525 with STARTTLS required because Render Free blocks the usual SMTP ports. No SMTP key existed at this check; the owner must generate it and approve storing it in Render before activation. The sender uses a freemail domain and Brevo displays a deliverability warning. `htafl@africamail.com` remains the contact inbox, not an owned sending domain. SMTP authentication, a real setup email and signup verification have not yet been tested.

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

Render service `htaflco-api` (`srv-db3lg9qj9qps73859d20`) deployed successfully. Its HTTPS origin is https://htaflco-api.onrender.com. Live HTTP checks returned health 200, empty Latest/Featured/Rising feeds 200, anonymous post creation 401, forged-Origin writes 403, anonymous moderation reports/sensitive queues 401, and unconfigured-email registration 503. The production media configuration confirms uploads are disabled. The worker's stored Rising timestamps advanced across several minutes; the current week's empty archive was saved. No test account was inserted by the rejected registration check. Database connections as `htafl_backend` reported TLS 1.3 after server SSL enforcement was enabled. Security advisors still returned no findings.

Render billing was inspected: Hobby workspace, no card on file, service/pipeline charges $0 and projected October total $0. The compute option is Free. Netlify's production-only `API_URL` is saved as the live Render origin; preview contexts are empty to avoid pointing tests at production. Netlify repository relinking and publishing remain pending while email activation is incomplete.

Verification: API typecheck, 31 tests with zero skipped, and build pass. The shared-host test checks real PostgreSQL, initial ranking snapshots, 401/403 gates, graceful shutdown and production registration failing closed with no SMTP or token logging. A local failing SMTP server proves production reports delivery failure as 503 without printing tokens. This is not a real-email delivery test. The in-app browser blocked opening the public Render health URL (`ERR_BLOCKED_BY_CLIENT`); live HTTP health and gates were tested using Node/curl, and Render's dashboard confirms the successful deployment. Netlify proxy, HTTPS member sessions and real email delivery remain unverified until activation and publication.
