CREATE TABLE "feature_interest" (
	"merchant_id" uuid NOT NULL,
	"feature_key" text NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "redemptions" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "feature_interest" ADD CONSTRAINT "feature_interest_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_interest" ADD CONSTRAINT "feature_interest_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feature_interest_uq" ON "feature_interest" USING btree ("merchant_id","feature_key");--> statement-breakpoint
CREATE INDEX "feature_interest_key_idx" ON "feature_interest" USING btree ("feature_key");