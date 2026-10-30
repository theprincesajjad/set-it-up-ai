# Apple Wallet and Google Wallet: founder setup checklist

This page lists what the founder has to do to turn on wallet cards, and what each step costs. Code lives in:

- `apps/api/src/services/wallet*.ts`
- `apps/api/src/routes/wallet/`
- `apps/web/src/components/pass/{ShopWalletCard,WalletButtons}.tsx`
- `apps/web/src/components/dashboard/wallet/`
- `apps/mobile/modules/ll-passkit`

API contract: [`api/wallet.md`](api/wallet.md). The spec audit (2026-10-30) is summarised at the end of this page.

## What customers and shops get

- **Shop card.** Every membership gets its own card in the shop's look: logo and name, card colour (the brand colour by default), a stamp strip ("4 of 6") or a progress bar, the next reward, the member's name, the next appointment, and the member QR (`LL:<memberCode>`). The QR is the same code the counter already scans, so staff do nothing new.
- **Buttons.**
  - iPhone: "Add to Apple Wallet".
  - Android: Google's official "Add to Google Wallet" button.
  - Computer: both buttons, plus a QR that opens the shop page on the customer's phone.
  - They appear on join success, the shop page (`/shops/<slug>#wallet`) and the booking confirmation.
- **Live updates.** Stamps, rewards, appointments (booked, moved, cancelled, finished) and the shop's own edits (wallet card, name, logo, colour, program, rewards, hours) update cards already in wallets.
  - Apple: an APNs push, after which the iPhone fetches the latest pass.
  - Google: a PATCH of the loyalty object, or of the class when the shop edits its card.
- **Removal.** When a customer deletes the card, Apple unregisters the device and Google sends a `del` callback. Either way we stop pushing to that card. Adding it again resumes updates.
- **Settings → Wallet card.** The shop sees live Apple and Google previews (front and back) and can set:
  - the card colour
  - the front (stamp strip or plain colour)
  - the reward line
  - whether hours and the booking link appear on the back
  - the terms
- **Privacy.** A home studio (`area`) or a pro who travels to clients (`city`) never has a street address, postal code or pin on the card. The card shows only "Bloor West area" or the city. Pharmacy visits never go on the card. Tests: `apps/api/test/wallet-shop.test.ts`, "privacy".

## What works with no credentials

| | No credentials (today) | `WALLET_DEV_FAKE=1` (dev / e2e, refused in production) | Real credentials |
| --- | --- | --- | --- |
| Customer web card (QR at the counter) | yes | yes | yes |
| Wallet buttons | hidden. One line: "Wallet cards for <shop> are coming soon. Your card on this page works at the counter." | shown | shown |
| Apple `.pkpass` | `503 wallet_not_configured` | real structure, signed by a throwaway chain (iOS will not install it) | installs on iPhone |
| Google link | none | opens a local preview page of the JWT payload | opens Google Wallet |
| Live updates | none | APNs pushes recorded, Google calls recorded | real pushes and PATCHes |
| Settings → Wallet card | previews work, with a note that the card switches on after setup | yes | yes |

## Costs

| Item | Cost |
| --- | --- |
| Apple Developer Program (organisation) | **US$99 a year**. Needs a D-U-N-S number for the company (free, a few days to a couple of weeks) |
| Pass Type ID, its certificate, APNs | included |
| Google Pay & Wallet Console issuer account | free |
| Google Wallet API, Google Cloud service account | free (no charge for the Wallet API) |
| Total | **US$99/yr** |

## 1. Apple (about 1 hour after the account is approved)

1. **Enrol** at https://developer.apple.com/programs/enroll/ as an organisation (Local Loyalty's legal name, D-U-N-S, website). US$99/yr. Note the **Team ID** (Membership details).
2. **Pass Type ID.** Certificates, Identifiers & Profiles → Identifiers → + → **Pass Type IDs**. Description "Local Loyalty cards", identifier `pass.ca.localloyalty.card` (reverse DNS, never changes once cards are out).
3. **Certificate.**
   1. On a Mac, open Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority. Save it to disk to get a CSR.
   2. In the portal: Certificates → + → **Pass Type ID Certificate** → choose the Pass Type ID → upload the CSR → download `pass.cer`.
   3. Double-click `pass.cer` to add it to Keychain. Right-click it → Export as `.p12` with a password.
   4. Base64 it: `base64 -i pass.p12 | pbcopy`.
   5. The certificate expires after about a year. Put a renewal reminder in the calendar now. A new certificate keeps the same Pass Type ID, and existing cards keep updating.
4. **WWDR G4 intermediate.**
   1. Download "Worldwide Developer Relations - G4" from https://www.apple.com/certificateauthority/.
   2. Convert it: `openssl x509 -inform der -in AppleWWDRCAG4.cer -out wwdr.pem`.
5. **APNs.** Nothing more to do. Apple's PassKit docs say pass updates are pushed "using the same certificate and private key" that signed the pass, so the pass certificate is the APNs credential. A token key (Keys → + → Apple Push Notifications service, `.p8`) is optional. Only set it if you also want it as a fallback.
6. **Badge.**
   1. Accept the licence and download the badges at https://developer.apple.com/wallet/add-to-apple-wallet-guidelines/ ("Download badge files").
   2. Copy the en-CA black SVG to `apps/web/public/wallet-badges/add-to-apple-wallet-en-CA.svg`.
   3. Set `NEXT_PUBLIC_WALLET_BADGES=1` on the web app.

   Until then, the web shows a neutral black button with the official wording. Apple licenses the badge only to program members, so it is not in the repo.
7. **HTTPS.** `PUBLIC_API_URL` must be https with a valid certificate, because Wallet refuses an http web service in production.

## 2. Google (about 30 minutes, then a review)

1. **Issuer account.**
   1. Go to https://pay.google.com/business/console and sign in with the Google account that will own it (use a shared company account, not a personal one).
   2. Enter the public business name "Local Loyalty" and accept the Google Wallet API terms.
   3. Click "Create a pass" → Google Wallet API, then copy the **Issuer ID**.
   4. Fill in the **Business profile**: business info and a payments profile. Google needs it before review.
2. **Service account.**
   1. In Google Cloud console (any project, for example "local-loyalty-wallet"), enable the **Google Wallet API**.
   2. Go to IAM & Admin → Service accounts → Create (for example `wallet@…iam.gserviceaccount.com`). Grant it no roles.
   3. Open Keys → Add key → JSON, and download the file.
   4. Back in the Wallet console → **Users**, invite the service account email with the **Developer** access level.
3. **Demo mode → production.**
   - **Demo mode (new accounts start here):** cards can be saved only by the console's Admin and Developer users and by test accounts you add under Users / test accounts, and every card says **"[TEST ONLY]"**.
   - **Going to production:**
     1. Save a card once so the console has a class. Classes are created on first save, one per shop (`<issuer>.ll_shop_<merchant>`).
     2. In the Dashboard, click **Request publishing access**.
     3. Google reviews the request and replies by email, typically within a few business days.

     Classes are sent as `UNDER_REVIEW`, and Google approves them automatically once the account has publishing access.
4. **Callbacks.** There is nothing to set. Each class carries its own callback URL (`/v1/wallet/google/callback?k=<key>`), so Google tells us when a card is saved or deleted.
5. **Origin.** The save JWT's `origins` is `PUBLIC_WEB_URL`, so the buttons must be served from that origin.

## 3. Environment variables (API; secrets manager, never the repo)

| Variable | Value |
| --- | --- |
| `APPLE_PASS_TYPE_ID` | `pass.ca.localloyalty.card` |
| `APPLE_TEAM_ID` | the 10-character Team ID |
| `APPLE_PASS_P12_BASE64` | base64 of `pass.p12` |
| `APPLE_PASS_P12_PASSWORD` | its export password |
| (or) `APPLE_PASS_CERT_PEM` + `APPLE_PASS_KEY_PEM` (+ `APPLE_PASS_KEY_PASSPHRASE`) | instead of the p12. PEM values may use `\n` escapes |
| `APPLE_WWDR_PEM` | contents of `wwdr.pem` (G4) |
| `APPLE_APNS_KEY_ID` + `APPLE_APNS_KEY_P8` | optional token fallback for APNs |
| `GOOGLE_WALLET_ISSUER_ID` | the Issuer ID |
| `GOOGLE_WALLET_SERVICE_ACCOUNT_JSON` | the JSON key (raw or base64) |
| `PUBLIC_API_URL`, `PUBLIC_WEB_URL` | https URLs |
| `WALLET_DEV_FAKE=1` | dev and e2e only (ignored in production): fake signer and fake Google |

Web: `NEXT_PUBLIC_WALLET_BADGES=1` once the Apple badge file is in place.

Check: `GET /v1/wallet/availability` should return `{ "apple": true, "google": true }`.

## 4. Test on real phones

**iPhone (Safari):**

1. Join a test shop at `/j/<counter code>`. Then tap **Add to Apple Wallet**. The Add sheet shows the card with the shop colour, stamps and QR. Tap Add.
2. At the counter (`/m/<id>/counter`), scan the card's QR and add a stamp. Within seconds the lock screen shows "Stamps: 5 of 6" and the card updates. Pass updates work only through production APNs, so this needs the real certificate on a deployed https API.
3. Book an appointment. The card shows "Next visit" and comes up on the lock screen before it.
4. Delete the card in Wallet. The registration disappears (`wallet_device_registrations`) and pushes stop.
5. If a card won't add, connect the iPhone to a Mac and read Console.app, filtered to "passd". Our web service also logs Apple's `POST /v1/log` lines as `[passkit]`.

**Android (Chrome):**

1. Sign in with a Google account that is a console user or test account (demo mode), or any account after publishing access.
2. Tap **Add to Google Wallet** → Save. Add a stamp at the counter: the card updates within a minute or so.
3. Remove the card in Google Wallet. A `del` callback marks it removed, and PATCHes stop.

**App (Expo):** the PassKit sheet needs a dev build (`eas build --profile development`), because Expo Go falls back to opening the link, which shows the same Apple sheet. On Android the app opens the save link in Google Wallet.

## Mobile app notes

- **iOS.** `apps/mobile/modules/ll-passkit` is a local Expo module, Swift, with no third-party dependency, so there is no version to pin. Expo autolinks `./modules`. It provides:
  - `addPassFromUrl(url)`: downloads the signed `.pkpass` and presents `PKAddPassesViewController` inside the app.
  - `LlAddPassButton`: Apple's `PKAddPassButton`. Apple's guideline for apps is to use the system button.

  Without the module (Expo Go, web), the app opens the signed link with `Linking`.
- **Android.** Google's native `PayClient.savePasses` needs a JWT signed for the app's SHA-1 and Google Play services, and the save URL opens the same Google Wallet flow. So the app opens the save URL with Google's official button artwork (`src/ui/googleWalletButton.ts`). There is no native module.

## Left out on purpose

- Apple NFC (`nfc`), because it needs Apple's NFC pass entitlement.
- Google Smart Tap.
- Google `object.locations`, which is deprecated and no longer triggers notifications. We use the class's `merchantLocations` (storefronts only).

## Audit summary (2026-10-30)

**Already correct before this work:**

- storeCard pass, SHA-1 manifest, detached PKCS#7 with the WWDR certificate
- the full PassKit web service
- the Google loyalty class, object, save JWT and PATCH

**Fixed:**

- Pass pushes now use the pass certificate first, per Apple's docs. They tried the `.p8` token first before.
- `merchantLocations` replaces the deprecated Google `locations`.
- The official Google button artwork replaces the home-made one. Google's approved label is "Add to Google Wallet"; "Save to Google Wallet" is no longer approved.
- The pass certificate can be supplied as a `.p12`.
- Removal is tracked.

**Added:**

- per-shop branded cards with the stamp strip at 1x/2x/3x (375×123 pt)
- `relevantDates` for appointments
- Settings previews
- the desktop QR
- the dev-fake signer
- the PassKit module
