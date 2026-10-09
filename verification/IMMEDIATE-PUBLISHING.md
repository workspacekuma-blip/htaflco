# Immediate publishing verification

Checked 9 October 2026. The owner requested removal of media approval, replacing the previous manual-review requirement. Text-only posts already published immediately.

## Changes

- `api/src/media.ts` and `api/src/routes/media.ts`: explicit `MEDIA_REVIEW_MODE=immediate` enables the existing private picture/video pipeline without a review requirement. Unknown/unset production modes remain disabled. Manual mode remains available for rollback.
- `api/src/routes/posts.ts`: validates media with Sharp/FFmpeg, then attaches its server-created immutable object and publishes the post in one transaction. Validation failure creates no post. Text-only posting, membership gates, Origin checks, rate limits, distress flags and the support message remain.
- `web/app/admin/page.tsx`: hides the approval queue in immediate mode; weekly prompts, reports and distress review remain. The composer already follows the API's review setting and now omits its approval notice.
- README, storage README and `.env.example`: document immediate publication and the absence of human/AI unsafe-content scanning.

## Tests actually run

- New integration tests first failed because production immediate uploads were disabled; after implementation both passed.
- Real PNG and MP4-with-audio fixtures publish without approval and appear in public detail/feed reads. Corrupt uploads create no post, unverified members cannot upload, another member cannot attach the file, attachment reuse is rejected, staging-link replacement cannot overwrite attached bytes, hiding blocks media access, and distress support survives immediate publication.
- Text-only posts publish immediately and retain the distress notice.
- Full suite: **53 API tests and 12 web tests passed, no skips**. Both typechecks and builds passed. Next's default Windows sandbox denied path canonicalization; the same build passed with approved workspace access. `git diff --check` passed.
- Supabase read-only count found **zero pending media posts**; no existing content was bulk-published or changed.

## Live deployment evidence

Code commit `7cd8cbf` is Published on Netlify, deployment `6ac82ffc4dbc690008d153c1`, and Live on Render Free, deployment `dep-db4445flk1mc73eonl6g`. The only environment change is the non-secret `MEDIA_REVIEW_MODE=immediate`; storage and account credentials were unchanged. The first deployment attempt was interrupted by the account's automatic-approval-review usage limit; the resumed deployment succeeded.

Fresh HTTPS through `https://htaflco.netlify.app/api`: health 200; media config 200 with pictures/videos enabled, `pendingReview=false`, 2 MB picture bytes, 10 MB MP4 and 30-second limit. The authenticated live browser showed weekly scheduling, reports and distress review, with no approval queue/buttons or error. The composer accepts JPEG/PNG/WebP/MP4, omits the approval notice and retains the total 10,000-character limit including its starter.

No production sample post, member, prompt or count was created. Actual immediate picture/video submissions were verified against the local API, PostgreSQL and S3 emulator, not by publishing test content on the live site. Supabase storage compatibility was separately verified in [the previous feature checks](COMMUNITY-MEDIA.md). No AI service was connected. Content safety now depends on member reporting and moderation after publication; file decoding checks are not content moderation.
