ALTER TABLE "merchants" ADD COLUMN "theme_style" text DEFAULT 'clear' NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "theme_dark" boolean DEFAULT false NOT NULL;