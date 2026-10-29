-- phase-pro P4: Google review request after every visit. merchants.google_review_url already exists (0006); only the mode is new. docs/business/pro-value.md P4
ALTER TABLE "merchants" ADD COLUMN "review_requests_mode" text DEFAULT 'off' NOT NULL;
