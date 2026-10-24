CREATE TABLE "merchant_occasions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"date" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"sms" text NOT NULL,
	"whatsapp" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "merchant_occasions" ADD CONSTRAINT "merchant_occasions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "merchant_occasions_merchant_idx" ON "merchant_occasions" USING btree ("merchant_id","date");