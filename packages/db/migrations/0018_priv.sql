CREATE TABLE "comm_opt_outs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"channel" text NOT NULL,
	"keyword" text,
	"source" text DEFAULT 'sms_reply' NOT NULL,
	"opted_out_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resubscribed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "comm_opt_outs_uq" ON "comm_opt_outs" USING btree ("phone","channel");