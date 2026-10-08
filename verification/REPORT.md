# HTAFL local verification report

Latest layout update (8 October 2026): the separate Featured tab/grid was removed at the owner's request. "On the wall right now" now reads the saved weekly top-five Featured feed. Rising is the default, with Latest and Browse retained. Existing backend ranking snapshots and weekly archive storage are unchanged; no archive browsing UI was added. Browser checks confirmed zero Featured tabs, five slider posts, Rising selected, 12 Latest posts and both Browse filters. Web typecheck, four tests and build passed. The first build attempt hit a sandbox filesystem restriction; the build passed with normal filesystem access. [Updated preview](featured-removed.jpg). The full-site findings below record the preceding verification layout.

Date: 8 October 2026. Repository: `htafl-site/`. This report covers the supplied Express/PostgreSQL and Next.js draft. The earlier sibling prototype is separate. The original 49-file draft was committed before edits as `d7d4327`; subsequent commits preserve reviewable groups of changes. No paid service or production deployment was activated.

## 1. Fixes grouped by file

| Files | Change and reason |
| --- | --- |
| `api/package.json`, `api/package-lock.json` | Installed and locked dependencies. Upgraded Nodemailer to 10.0.16 with user approval to address reported advisories. |
| `web/package.json`, `web/package-lock.json` | Approved Next.js 16.4 / React 19.3 security upgrades, matching types, and a small `tsx` development dependency for the new test command. |
| `web/tsconfig.json`, `web/next-env.d.ts`, `web/AGENTS.md` | Next-generated configuration and guidance for the upgraded compiler/runtime. |
| `web/app/info/[slug]/page.tsx` | Await dynamic route parameters for the upgraded Next.js version. Placeholder text is unchanged. |
| `api/src/server.ts` | Export the existing Express app and only listen when run directly, allowing HTTP integration tests on an isolated port. |
| `api/src/auth.ts` | Authenticated and moderator routes check the account's current status and role in PostgreSQL. A demoted/suspended moderator no longer retains cookie-based permissions; SQL promotion works with the existing session. |
| `api/src/queries.ts` | Saved Featured/Rising snapshots immediately exclude newly reported or distress-flagged posts, even before the next worker run. Ranking calculations are unchanged. |
| `api/src/routes/posts.ts` | Reject comment reads for missing/hidden/removed posts. |
| `api/.env.example`, `api/test/integration.test.ts` | Document the separate test database and add guarded real PostgreSQL/HTTP integration tests, including local S3 checks. |
| `web/test/api.test.ts` | Test cookie forwarding and useful handling of server, proxy and network errors. |
| `web/app/verify/page.tsx` | Reuse the verification request during React Strict Mode effect replay. Previously the first request consumed the one-use token and the second displayed an error; reproduced and retested in the browser. |
| `web/components/PostCard.tsx` | Replace unsupported `window.prompt()` with a small inline report field. Catch comment-load errors and update card state after refreshed post data. Report submission was tested through moderation. |
| `web/components/Front.tsx`, `web/components/PostSlider.tsx` | Refresh votes when the signed-in account changes; ignore stale requests; show a load error and retry control. Stale selected votes after logout were reproduced, fixed and retested. |
| `web/app/wall/page.tsx`, `web/components/Composer.tsx` | Catch wall-load and verification-resend errors, preserving useful recovery messages. |
| `web/app/layout.tsx` | Declare existing smooth-scrolling behavior for Next route transitions. |
| `api/scripts/dev-seed.ts`, `scripts/fixtures/upload-test.png` | Explicitly separate, labelled local-only QA data and a test picture. Never run by production code. |
| `scripts/start-local.ps1`, `.gitignore`, `README.md` | Restart the prepared Windows services without erasing databases; ignore local data/secrets; document commands and verified limitations. |

The sage/navy/gold design, structure and prose were preserved, except the broken report prompt now has an inline field. `api/src/ranking/score.ts`, ranking fairness rules, password hashing, Origin checks, rate limits and `api/src/safety.ts` were not weakened or replaced. The support message and Composer's region-resource TODO remain.

## 2. Tests actually run and results

| Check | Result |
| --- | --- |
| API install, typecheck and build | Passed. |
| API `npm test` | 19 passed, zero failed, zero skipped. Eight original ranking tests plus 11 integration tests. |
| Web install, typecheck, `npm test`, build | Passed. Four API-client tests passed; production build generated all 13 pages. |
| Dependency audits | Both reported zero known vulnerabilities after the approved upgrades. This is an audit result, not a full security certification. |
| API health / same-origin proxy | `/health` and `/api/health` returned `{ok:true}` with real PostgreSQL. |
| Registration and verification | Alice and Bob registered through the browser; console links were used; verified success rendered. Strict Mode verification bug was reproduced and fixed. |
| Logout and login | Passed with the built-in password flow. Selected vote state now clears after logout. |
| Text/picture/safety | Text saved, picture uploaded/displayed at 640×480, distress phrase showed the original gentle support notice. |
| Votes and comments | Upvote→downvote→remove rendered scores 1→−1→0; own-post voting was rejected. Bob saw Alice's post and comment. |
| Latest and Browse | Latest loaded 12→24→29 posts before subsequent QA changes; database tests proved unique, complete pagination with tied timestamps and microseconds. Craft/kind filters and an empty combined result worked. |
| Featured and Rising | Five Featured and three Rising cards rendered after local trusted voting/backdating. Tests verify eligibility, author uniqueness, craft caps and newcomer reservations; formulas remain unchanged. |
| Slider | Autoplay changed its scroll position; pause held the position over another interval; previous and next moved it. |
| Your wall | Bob created a post, edited/saved it, cancelled deletion, then confirmed deletion; the wall became empty. |
| Moderation | Bob was promoted via SQL. Report appeared, hide changed the post to `hidden`, resolve cleared the report, and reviewing cleared `sensitive`. Hidden content disappeared from Alice's public feed. |
| Storage checks | Presigned PUT, HeadObject, public read, CORS permitting local PUT, unsupported type, another user's key and oversized attachment rejection passed against loopback S3rver. |
| Recovery | Unverifying the disposable Bob account caused a useful save error and retained its textarea draft. API shutdown caused a visible load error; restart + Try again recovered the feed. Bob's verification status was restored. |
| Mobile / keyboard / dark | 390×844 viewport: document width equalled its available client width (375px with scrollbar), with no page overflow. Keyboard Enter/Tab and visible focus were exercised. System dark mode was inspected. |
| Git and restart | Original baseline exists, changes are in small commits, `git diff --check` passed, secrets/database files are not tracked. The restart helper ran successfully. |

Browser work used the real Codex in-app browser through its Playwright controls, not mocked browser responses. Screenshots: [desktop](desktop.jpg), [mobile](mobile.jpg). The preview uses disposable accounts and posts labelled Local QA. The worker runs separately against the development database.

## 3. Not tested or only partly tested

- **MinIO:** Docker is absent. The official community Windows binary URL returned HTTP 410. S3rver was used as a local test emulator. Production S3 behavior, credentials, bucket policies and CORS still require testing with the chosen provider. The emulator returns wildcard CORS; the production example restricts the website origin.
- **SMTP:** no provider is configured. Console verification links work; external delivery, bounce handling and sender-domain authentication were not tested.
- **Production:** no hosting account was configured or deployed. HTTPS-only cookie behavior, reverse-proxy settings, backups, migrations and recovery need staging checks.
- **Accessibility/browser coverage:** mobile layout, visible focus and keyboard activation were checked in the in-app browser's dark mode. No screen reader, other browser, forced light mode or reduced-motion preference was tested. Reduced-motion code was preserved.
- **Image safety:** only existing size/type/ownership checks were tested. No unsafe-content scanning exists.
- **Moderation operations:** the implemented post controls were tested. Staffing, response times, escalation, appeals and comment/profile moderation workflows are owner decisions.
- **Load and email recovery:** no traffic stress test, password-reset flow or verification-token expiry test was performed; the latter two flows are not implemented.

## 4. Remaining bugs and launch risks

These are observations from the existing code and have not been fixed in this verification scope:

- Account deletion cascades votes and comments without recalculating counters on surviving posts. This can leave displayed vote/comment counts stale; the ranking worker reads actual votes, but public counters need a separate fix. Account deletion was not part of the requested browser walkthrough.
- Verification tokens have no expiry timestamp. The UI mentions expiry, but the server implements one-use tokens rather than timed expiry. There is also no password-reset flow.
- bcrypt truncates beyond 72 bytes while the current registration schema permits up to 100 characters. Password limits/handling need a follow-up before production.
- Hidden/removed posts disappear from Your wall because it uses the published feed query, despite the page saying everything stays there. The owner should decide how authors see moderation outcomes.
- Image type checking trusts storage metadata; bytes and unsafe content are not scanned. Reusing a still-valid presigned PUT can overwrite an attached object. Unused objects have no configured cleanup rule.
- Rate limits are process-local; a multi-instance deployment needs shared limits. Comment reads stop at 100 and have no pagination. The ranking worker has no deployment supervisor or distributed job lock.
- Keyword distress detection is only a first pass. The support-resource TODO and legal/accessibility/credits placeholders remain. These need owner review before public launch.

## 5. Open decisions — unchanged, with recommendations

| Decision | One-line recommendation |
| --- | --- |
| Whether under-18s are allowed | Start with adults until the owner has an age policy and the required safeguarding process. |
| Whether anonymous visitors may read posts | Prefer member-only reading for personal hardship stories, or clearly tell authors when publishing to a public wall; current public reading is unchanged. |
| Who moderates and how | Name accountable moderators, coverage hours and a written distress/report escalation process before launch. |
| Hosting and email providers | Choose owner-controlled accounts after reviewing operating costs, backups and email delivery requirements; no provider was selected here. |
| Managed sign-in versus built-in passwords | Evaluate managed sign-in for reset/session/recovery support; retain the current implementation until the owner decides. |
| How pictures are scanned | Quarantine uploads and scan them before public delivery using an owner-selected service and review process. |
| Whether downvote counts are public | Consider displaying net score publicly and keeping separate downvote totals for moderation; current API/UI behavior is unchanged. |
