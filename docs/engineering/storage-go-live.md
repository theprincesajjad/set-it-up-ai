# Storage go-live (Cloudflare R2)

Production file storage is **Cloudflare R2**, used through its S3-compatible API. This is the sibling of `stripe-go-live.md`. Code: `apps/api/src/providers/storageR2.ts` (provider), `apps/api/src/lib/sigv4.ts` (request signing), `providers/storage.ts` (`createStorage`, `getStorage`), `config.ts`. Tests: `apps/api/test/sigv4.test.ts` (AWS's published SigV4 examples), `apps/api/test/storage-r2.test.ts` (a local S3 fake that re-verifies every signature; no network).

## What is stored

| Thing | Key | Read how |
| --- | --- | --- |
| Repair-ticket photos | `<merchantId>/<32 hex>.<jpg|png|webp|heic|heif>` | The database keeps only `/v1/public/uploads/<key>`. On every read `uploadSigner(ctx)` asks the provider for `signedUrl(key, now + UPLOAD_LINK_MINUTES)`: an R2 presigned GET, 15 minutes. Never a permanent link. |
| Owner export ZIP and data exports | Built on request and streamed to the caller; **not stored**. The ZIP reads photos back with `get(key)` (`merchant-export.ts`). | Nothing to presign today. If exports are ever kept, store them under their own key prefix and add a lifecycle rule for it. |
| Retention and account deletion | `privacy-scrub.ts` calls `delete(key)` | Resolves `true` only if the object existed. |

## Config

| Variable | Notes |
| --- | --- |
| `STORAGE_PROVIDER` | `r2`, `disk` or `memory`. Default `memory` in tests, `disk` elsewhere. `memory` is refused in production. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Required when `r2`; startup fails naming whichever is missing. |
| `R2_ENDPOINT` | Optional. Use it for a jurisdiction bucket (`https://<account>.eu.r2.cloudflarestorage.com`) or a local fake. Default `https://<account>.r2.cloudflarestorage.com`. |
| `R2_PUBLIC_BASE` | Optional. Only changes the URL `put` returns. **Leave empty**: R2 presigns only on the S3 endpoint (not a custom domain), and a public domain would make photos permanent links, which the privacy policy says we do not do. |

### Why no AWS SDK

Signing is about 60 lines of HMAC-SHA256 and the provider needs three verbs (PUT, GET/HEAD, DELETE) plus a presigned GET. `@aws-sdk/client-s3` plus `@aws-sdk/s3-request-presigner` pull in dozens of packages and a middleware stack for that. The signer is pinned by AWS's own worked examples, and the provider is exercised end to end against a fake that recomputes signatures, so a drift would fail CI. Switch to the SDK if we ever need multipart uploads (files over 5 MB are not accepted today, `MAX_UPLOAD_BYTES`).

## Bucket setup

1. Cloudflare dashboard, R2, **Create bucket**. Name it (for example `ll-uploads-prod`). Location: see "Data residency" below. Keep **public access off** (no `r2.dev` URL, no custom domain).
2. R2, **Manage API tokens**, create an **Account** or **User API token** with **Object Read & Write**, scoped to this bucket only. Copy the Access Key ID and Secret Access Key (shown once) into `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`. `R2_ACCOUNT_ID` is on the R2 overview page.
3. Set the four variables and `STORAGE_PROVIDER=r2` on the API. Smoke test: sign in as a repair shop, upload a ticket photo, open it (a link with `X-Amz-Signature`), wait 15 minutes, confirm the same link now returns 403.
4. Add the CORS and lifecycle rules below.

## CORS

Photos are uploaded to our API and read through presigned links in `<img>` tags, which do not need CORS. Browser `fetch` of a presigned link (the web app's photo viewer and the export download) does. Allow GET from the app origins only:

```json
[
  {
    "AllowedOrigins": ["https://app.localloyalty.example", "https://localloyalty.example"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Range"],
    "ExposeHeaders": ["Content-Length", "Content-Type", "ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Dashboard: bucket, Settings, **CORS Policy**, Add CORS policy, JSON tab, paste (replace the origins with the real `PUBLIC_WEB_URL` values). Wrangler uses a different shape (`{"rules":[{"allowed":{"origins":[...],"methods":["GET","HEAD"]}}]}`) with `npx wrangler r2 bucket cors set <bucket> --file cors.json`. No `PUT` is needed because the browser never writes to R2 directly.

## Lifecycle rules (match `packages/shared/src/retention.ts`)

The app deletes photos itself: `jobs/retention.ts` removes repair photos `RETENTION.repairPhotoMonths` (24 months) after the ticket closes, and account deletion calls `delete(key)`. That is the source of truth, because the clock starts at ticket close, which R2 cannot see (it only knows the upload time). The bucket rules are a **backstop** for anything the job missed, so they must be **longer than the retention period plus the longest a ticket stays open**; they must never be shorter, or a photo could vanish while the policy says we keep it.

| Rule | Prefix | Action | Why |
| --- | --- | --- | --- |
| Backstop for repair photos | none (all keys are `<merchantId>/...`) | Delete objects **1,095 days** after upload | 24 months (`repairPhotoMonths`) plus a year for tickets that stay open. If `repairPhotoMonths` changes, revisit this number. |
| Abort incomplete multipart uploads | none | **7 days** after initiation | R2 applies this by default; set it explicitly. |
| Exports, only if ever stored | `exports/` | Delete **`RETENTION.leaverExportDays`** (90) days after upload | Matches the 90-day leaver export window. |

Set them in the dashboard (bucket, Settings, **Object lifecycle rules**) or with `npx wrangler r2 bucket lifecycle add <bucket>` (confirm the flags with `--help`; Cloudflare's docs describe prefix filter, `Expiration.Days` and `AbortIncompleteMultipartUpload.DaysAfterInitiation`). R2 removes expired objects typically within 24 hours of the expiry time, so treat the day counts as approximate.

## Data residency (Canada)

Checked against Cloudflare's [R2 data location docs](https://developers.cloudflare.com/r2/reference/data-location/) (fetched Oct 25, 2026):

- **Location hints** are `wnam`, `enam`, `weur`, `eeur`, `apac`, `oc`. There is **no Canada hint**. Hints are set when the bucket is first created, and Cloudflare says they are "a best effort and not a guarantee".
- **Jurisdictions** (a real guarantee, fixed at creation, reached through a jurisdiction endpoint) are `eu`, `fedramp` and `us`. **There is no Canadian jurisdiction.**

What to do:

1. Create the bucket with location hint **`enam`** (Eastern North America, the closest to Toronto). Do not pick a jurisdiction: `eu` would move Canadian customers' photos to Europe and `us` states a US location outright.
2. Do not promise "Canadian-hosted files". The privacy policy lists Cloudflare R2 as a processor "kept in North America", and the existing sentence that some processors are in the United States or elsewhere covers it. PIPEDA allows processing outside Canada with transparency and contractual safeguards (`docs/legal/compliance-checklist.md`, data residency item). Quebec Law 25 asks for a privacy impact assessment before data leaves Quebec: record this one.
3. Accept Cloudflare's Data Processing Addendum (check Cloudflare's current terms for where it is signed).
4. Re-check the docs page before launch; Cloudflare adds regions over time. If a Canadian option appears, create a new bucket there, copy the objects (`rclone` against the S3 API), switch `R2_BUCKET` / `R2_ENDPOINT`, then delete the old bucket. Keys are location independent, so the database needs no change.

If strict Canadian residency for photos becomes a requirement before then, the alternatives are a Canadian-region S3 bucket (for example AWS `ca-central-1`) behind the same provider (it only needs `endpoint` and region changed) or keeping `disk` on a Canadian host.

## Go-live checklist

- [ ] Bucket created, public access off, location hint `enam`.
- [ ] Bucket-scoped token created; four R2 variables and `STORAGE_PROVIDER=r2` set; API restarts cleanly.
- [ ] Upload, view, and expiry smoke test (above) passes.
- [ ] CORS set to the real app origins.
- [ ] Lifecycle backstop (1,095 days) and multipart abort (7 days) set.
- [ ] Cloudflare DPA accepted; privacy policy lists Cloudflare R2; compliance checklist items ticked.
- [ ] Existing disk uploads (if any) copied to R2 under the same keys (`rclone copy ./data/uploads r2:<bucket>`); the database needs no change.
