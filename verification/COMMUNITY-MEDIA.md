# Community and private-media verification

Checked 8–9 October 2026 in the existing Windows workspace. Local test data is explicitly labelled and separate from production.

## Commands actually run

- API: `npm run typecheck`, `npm test`, `npm run build`, `npm audit --audit-level=low`.
- Web: `npm run typecheck`, `npm test`, `npm run build`, `npm audit --audit-level=low`.
- Result: **51 API tests and 12 web tests passed**, no skips; both builds/typechecks passed, zero audit vulnerabilities. The Next build required the usual Windows sandbox path permission. The API integration suite recreates only the dedicated `_test` database; local S3 checks use the loopback emulator.
- Additive local upgrades ran with `npm run db:upgrade`. Supabase migration `community_features_and_private_media_review` succeeded. New tables have RLS, no anon/authenticated reads and dedicated backend writes. Supabase security advisors returned no notices.

## Feature evidence

Tests cover heading/response-label persistence, 10,000-character acceptance and 10,001 rejection, author-only editing, title distress detection, private notification pagination/read state, self-reply exclusion, hidden/deleted content exclusion, opt-in consent and opt-out cancellation, and current/future UTC-week prompt gates/rollover.

Actual local SMTP protocol servers received queued email: generic content omitted story/heading/reply text; concurrent workers sent once per claim and the daily budget was enforced. A 421 response retried later; an exhausted stale claim failed after restart. Unsubscribe tokens cannot serve as login cookies. No new production reply email was sent by these tests. SMTP remains at least-once delivery across a crash after provider acceptance, and sleeping Render delays jobs.

Real MP4s were generated, decoded and converted, including audio. Forged/truncated/over-length clips were rejected. Private-media tests prove pending visibility, current moderator permissions, no publication bypass, immutable attachment bytes after staging-link reuse, duplicate attachment rejection, HEAD/range serving and access denial after hiding. Interrupted media processing recovers after five minutes. Temporary-object cleanup preserves attached validated media and removes expired staging/deleted-post objects.

The real local browser confirmed heading/first-line cards opening complete text, response labels, a second account replying and the author receiving/reading a notification, persistent email opt-in, weekly scheduling, and picture/video upload followed by moderation approval. The native player decoded and played the two-second clip on the pending moderation screen and the published full post (`readyState=4`, no media error). A browser date-input value reverted while editing another field; `onInput` fixed this and a future prompt was visibly stored under 2026-10-12. A local upload initially failed because the isolated preview origin was absent from the emulator's CORS rule; permitting the two local origins recovered the preserved draft. Production Origin checks were unchanged.

A 390-pixel iframe verified the notification screen without horizontal overflow (375-pixel scroll width inside a 390-pixel viewport). The browser viewport override did not affect the hidden tab, so the exact-width frame was used instead. Keyboard focus in that frame was unsupported by the browser tool; the standalone page showed a solid focus outline after Tab. Dark mode was active. This is not a device or screen-reader audit.

The original 20 KB JSON cap rejected 10,000 multibyte characters. A reproduced test failed with 500; the bounded 64 KB cap now accepts the Unicode story. Oversized and malformed requests return useful 413/400 responses without logging their request text. Both ASCII/Unicode boundaries and these transport errors passed.

## Production storage evidence

Supabase `htafl-media` is private, with a 10 MiB provider cap and only JPEG/PNG/WebP/MP4. The API imposes the stricter decimal 10 MB video cap and 2 MB picture upload cap; browser pictures are compressed from up to 5 MB.

A disposable private PNG verified signed PUT 200, matching SDK readback, eight-byte range reads, anonymous public-URL denial and unsupported-MIME rejection. CORS permits `*`; authorization is the signed URL, not CORS. The temporary object was removed. S3 keys bypass RLS across project buckets and were saved only in the owner-approved Render environment, outside GitHub. No production sample post, account, prompt or count was inserted.

## Limits and remaining decisions

Human moderation was explicitly approved; this is not automated unsafe-content scanning. Existing picture URLs and password hashes are not migrated. Video captions/transcripts, built-in password recovery and account export remain unimplemented. Free storage/egress quotas, Render cold starts and review coverage need operational attention. No load test, screen-reader audit or cross-browser compatibility claim is made.

## Deployment checks

Final code commit `6d136ff` reached **Live on Render Free**, deployment `dep-db42m47lot8c73cgiosg`, and **Published on Netlify**, deployment `6ac82af3e17b9a000825b0fe`. Render's deployment logs confirm a successful typecheck/build and zero dependency vulnerabilities, using the owner-approved storage environment. No paid plan was activated.

Fresh HTTPS checks through `https://htaflco.netlify.app/api` passed health 200, manual media config (pictures/videos enabled, pending review required), current prompt 200 with none scheduled, anonymous notifications/moderation 401 and forged-Origin posting 403. A 10,000-character Unicode POST without authentication reached the members-only gate (401), proving the deployed parser accepts its size without creating a post. Oversized and malformed bodies returned 413 and 400.

The authenticated live browser showed four actual Latest posts, each with a heading link, one-line preview and response label. Opening an existing post reached its complete-text page and comment input. Notifications finished loading with the default email checkbox unchecked and an empty inbox; Moderation displayed weekly scheduling and the media-review queue without an error. No production preferences, prompts, posts, comments or review decisions were changed for these checks.

Full picture/video upload, transcoding, moderator approval and reply-email delivery were verified locally, **not end to end on Render**. The separate Supabase signed-upload/read/range/security checks above establish provider storage compatibility, but do not substitute for those production flows. No new production reply email was sent. The remaining production acceptance check should use a real member's intended media post and reply, rather than seed content.
