-- Wave O, team import: the 24-hour cache of website imports (onboarding step 1, Settings "Refresh from my website").
CREATE TABLE "site_import_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"result" jsonb NOT NULL,
	"logo_b64" text,
	"logo_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "site_import_cache_url_uq" ON "site_import_cache" USING btree ("url");--> statement-breakpoint
CREATE INDEX "site_import_cache_expires_idx" ON "site_import_cache" USING btree ("expires_at");