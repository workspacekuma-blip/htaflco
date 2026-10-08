# Production storage preparation

These are review templates, not applied policies. No production provider or unsafe-content scanner has been selected. `NODE_ENV=production` disables picture publishing in both the configuration endpoint and upload/attachment functions. There is deliberately no environment switch to bypass scanning. Existing picture URLs are not hidden by this guard; their storage access must be reviewed separately.

## Storage contract

- `uploads/`: private staging, browser PUT only through the API's five-minute signed URL.
- `quarantine/legacy/`: private validated copies, operator/scanner access only. Never expose this prefix through a public bucket or CDN.
- `pictures/`: eventual approved immutable attachments. Publishing credentials must be separate from staging/migration credentials. No browser upload link may write here.

For AWS S3, replace `YOUR_BUCKET` and review the private bucket policy and separate app/migration identity policies. Keep Block Public Access enabled and use Bucket owner enforced object ownership with ACLs disabled. These identity templates intentionally grant no bucket listing, delete, ACL changes or published-picture writes. Do not combine them with broader credentials. The app policy describes a future production staging role; local development's current direct publisher also requires `PutObject` on `pictures/*` and must use separate local credentials. See [AWS Block Public Access](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html) and [AWS object ownership](https://docs.aws.amazon.com/AmazonS3/latest/userguide/about-object-ownership.html).

The CORS template allows only PUT from the requested Netlify origin. CORS is not authorization: signed URLs and storage permissions still enforce access. Confirm the final site origin before applying. See [AWS CORS configuration](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ManageCorsUsing.html).

AWS IAM JSON is not portable to every S3-compatible provider. Map equivalent permissions and verify denial cases on the chosen provider. Do not enable whole-bucket public access on a bucket containing staging or quarantine. If using R2 public buckets, separate private and published storage or use a restricted delivery gateway; the current one-bucket media configuration needs adapting before that activation. See [R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/).

Review retention before adding cleanup: staging can expire after upload links and retry windows have elapsed; quarantine needs a review/appeal window. Never expire all `pictures/` objects indiscriminately. Use a separate cleanup role, compare against database references, and retain recovery copies. No expiry/delete rules are applied here.

## Read-only inventory and legacy picture preparation

Run in `api/` with the appropriate database/storage environment; never commit those credentials:

```bash
npm run legacy:audit
npm run legacy:audit -- --prepare --output ../verification/legacy-preparation.local.json
```

The first command reads only the database and prints aggregate counts. The second reads strictly author-owned literal `uploads/` URLs under the configured `S3_PUBLIC_BASE`, fully validates/re-encodes their pictures with Sharp and writes deterministic SHA-256-named quarantine copies and a local manifest. External URLs, encoded/traversing paths, query URLs and foreign-owner paths are not fetched. Neither mode changes posts, accounts, passwords or old objects. Other picture URLs require separate operator review.

Manifests contain post/author IDs and source URLs. They must be kept private, are gitignored through `*.local.json`, and cannot overwrite an existing file. On partial failure, review the checkpointed manifest and rerun to a new filename. Matching quarantine content can be reused; conflicting bytes cause a review error. There is no publish/apply/delete mode. The file permission mode is best effort; on Windows also protect the folder through ACLs.

Use read-only database credentials for this tool and the migration storage role above. Before real preparation, verify anonymous GET denial for uploads/quarantine, app-role quarantine denial, migration-role published-picture write denial, denied foreign origins, HTTPS and conditional writes. The local S3 emulator proves the command flow, not production privacy or policy enforcement.

## Scanner activation and eventual migration

Sharp validates picture encoding and strips metadata; it does not determine whether content is safe. The owner must choose the scanner, review thresholds, human escalation and retention before activation. No images have been submitted to any scanning provider.

The future publisher must scan the canonical quarantine bytes and record their SHA-256, scanner/version, policy version, result and review status. Timeouts, unavailable scanners and uncertain results remain private. Only an explicit approved result may publish those exact bytes to a new server-owned key with conditional creation. Then update the post transactionally only if its author, status and original URL still match the reviewed manifest. Recheck moderation eligibility and avoid resurrecting deleted/hidden content. No such publish step is implemented until the scanning choice is made.

Validate migrated posts and delivery before removing legacy access. Purge old CDN caches, privatize original staging objects and retire old upload permissions/keys where needed. Keep a rollback mapping without automatically republishing unsafe originals. Already-public legacy pictures remain exposed until storage policy/cache changes occur; preparation alone does not remove that exposure.

## Legacy passwords

The audit reports bcrypt structure/cost and unsupported hashes without printing hashes, emails or passwords. Original password byte length cannot be inferred from a bcrypt hash, and hashes cannot be safely rehashed without the original password. Existing hashes stay unchanged. The login/register 72-byte UTF-8 limit prevents further truncation; previously oversized passwords now need verified account recovery.

Choose built-in recovery or managed sign-in before implementing that flow. Built-in reset must use verified ownership, hashed short-lived single-use reset tokens, abuse limits and session invalidation; do not send or force resets from this audit. Weak/unsupported hash counts require operator review. No password-reset implementation or email delivery is claimed here.
