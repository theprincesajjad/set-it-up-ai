-- Pro value P6: weekly money report counters, the weekly goal and the report time. docs/business/pro-value.md 3.2 P6
CREATE TABLE "merchant_signals" (
	"merchant_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"key" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "merchant_signals_merchant_id_period_start_key_pk" PRIMARY KEY("merchant_id","period_start","key")
);
--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "weekly_goal_cents" integer;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "weekly_report_weekday" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "weekly_report_hour" smallint DEFAULT 18 NOT NULL;--> statement-breakpoint
ALTER TABLE "merchant_signals" ADD CONSTRAINT "merchant_signals_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;
