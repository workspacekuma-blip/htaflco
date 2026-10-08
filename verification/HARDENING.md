# HTAFL password, picture and archive fixes

Verified 8 October 2026. These findings supersede the corresponding password/picture/archive items in the preceding verification report. No production service or paid activation was made.

## Changes

- `api/src/routes/auth.ts`, `web/app/join/page.tsx`: registration and login enforce the bcrypt 72-byte UTF-8 boundary, reject malformed Unicode before encoding and give a useful error. Existing hashes and bcrypt cost remain unchanged. Join displays the limit with an accessible description.
- `api/src/media.ts`, API package/lockfiles: approved Sharp 0.35.5 addition. Only JPEG/PNG/WebP signatures reach the decoder; actual format must match upload metadata and extension. Bounded reads, a 16-megapixel input limit and full decoding reject invalid files. The server orients, resizes, strips metadata and writes a new JPEG under a server-created `pictures/` key. Reusing the staging PUT link does not change the attached object. Node 20.9+ is required.
- `api/src/ranking/worker.ts`: every Featured computation saves the current week's latest recorded list, using UTC Monday-start dates. Past weeks are retained; stale snapshots recover missing archives after downtime. Snapshot and archive writes share a transaction. No ranking formula or fairness rule changed. No archive UI was restored.
- `web/components/PostSlider.tsx`: describes up to five community picks chosen through votes and a fair mix of creators, instead of promising a raw upvote-count leaderboard.
- `api/test/integration.test.ts`, `README.md`, schema comment: regression coverage and accurate storage/password/archive setup notes. No database migration or new environment variable is required.

## Tests actually run

The regression tests first failed against the original behavior: oversized password registration returned 201, archive recovery was absent, archive failure did not roll back ranking, pictures used the mutable staging URL and forged image contents were accepted.

After the fixes, API typecheck, **24 tests (zero skipped)** and build passed. Web typecheck, **four tests** and build passed. API dependency audit reported zero known vulnerabilities after Sharp installation.

API tests exercised ASCII and emoji passwords at/over 72 bytes, correct and different passwords, invalid UTF-16, a missed Sunday, fresh worker processes, frozen completed weeks and transaction rollback on a forced archive write failure. Local S3 tests exercised JPEG/PNG/WebP decoding, orientation, metadata removal, invalid/truncated/mismatched contents, pixel/byte limits, ownership and PUT replay without replacing the attachment. These used the separate `_test` database and local storage emulator, not production data.

In the real browser, a labelled local QA picture was posted successfully and displayed as a 640×480 JPEG under `pictures/`. Join showed the byte-limit guidance. An oversized login displayed the 72-byte error, followed by a successful normal login. The revised slider wording was present. The development ranking worker was restarted with the new code.

Screenshots: [validated picture](validated-picture.jpg), [password error](password-limit.jpg), [home preview](hardening-preview.jpg).

## Limits and remaining work

- Image format validation is not unsafe-content scanning. Provider choice remains the owner's decision.
- Production storage permissions/private staging, provider compatibility and lifecycle cleanup still need staging verification. Local S3rver serves the test bucket publicly.
- Pre-fix attachments still reference `uploads/`; they were not migrated. Disposable QA images can be replaced. Real legacy images require validation/migration before launch.
- Previously accepted oversized passwords now fail validation; arrange verified recovery for affected accounts. Password reset and verification-token expiry remain unimplemented.
- Archives preserve the last successful recorded list, not an unknowable result during downtime. Entire weeks with no recorded list cannot be reconstructed.
- The previously reported account-deletion counter bug and other launch decisions remain open.
