ALTER TYPE "public"."staff_role" ADD VALUE 'instructor';--> statement-breakpoint
ALTER TABLE "class_sessions" ADD COLUMN "instructor_user_id" uuid;--> statement-breakpoint
ALTER TABLE "class_settings" ADD COLUMN "milestone_classes" integer;--> statement-breakpoint
ALTER TABLE "class_settings" ADD COLUMN "milestone_reward_name" text;--> statement-breakpoint
ALTER TABLE "class_settings" ADD COLUMN "milestone_reward_id" uuid;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_instructor_user_id_users_id_fk" FOREIGN KEY ("instructor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;