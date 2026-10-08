# Verification sign-in and owner role — 8 October 2026

The owner reported successful account verification. A production database query uniquely identified `dyrctkm` as an active, email-verified member. At the owner's explicit request, that account was promoted to `admin` by its UUID; a second query confirmed the stored role. The existing live session refreshed without logging in again, and the live website displayed Your wall, Moderation and Log out (dyrctkm). Opening the moderation page encountered a browser DNS error; this is not evidence of a permissions failure. Supabase security advisors returned no findings.

`api/src/routes/auth.ts` now atomically consumes an active account's verification token and creates its normal session using the returned account ID and role. A second concurrent use or replay fails. Missing, malformed, unknown and suspended-account links cannot sign anyone in. Verification responses cannot be cached. `web/app/verify/page.tsx` waits for the account refresh before displaying success and explaining that the visitor is signed in. Its existing Strict Mode request reuse remains in place.

The four new PostgreSQL integration tests cover signed-out redemption, `/auth/me`, member posting permission, token clearing, replay and concurrent redemption, replacing another account's session, preserving admin permissions, suspended and invalid tokens, and production Secure/HttpOnly/SameSite cookie attributes. The original behavior failed the new tests before implementation. The no-store assertion also failed before its header was added.

Local checks: API typecheck, all 35 tests (zero skipped), and build passed. Website typecheck, all five tests, and build passed. The first website build failed because the Windows sandbox denied path resolution; the same build succeeded outside the sandbox.

Real browser check used a disposable account in the local development database only: signed out first, opened the verification link, saw Email verified and Log out (Local verification QA), then opened the home page and confirmed the composer was available without entering a password. The screenshot is stored outside Git. No synthetic account or post was added to production.

This change has not yet been tested with a fresh production verification email. The owner's already-used link remains consumed. Existing verification tokens have no expiry timestamp; adding a token lifetime and password recovery is separate work.

The auth code was pushed as `5ebeae2`; Render deploy `dep-db3vjhks728c73fdfab0` visibly reports Deploy succeeded / Live for that commit's title, with a 50.6-second deploy duration. Direct public HTTP checks hit DNS resolution errors during the follow-up; no new production signup was created to bypass the consumed owner link.
