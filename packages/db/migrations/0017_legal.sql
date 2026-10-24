-- users.birthday: month and day only ("MM-DD"). The privacy policy promises we never keep the year.
-- Backfill: drop the year from every stored date, then refuse anything but a month-day.
ALTER TABLE "users" ALTER COLUMN "birthday" SET DATA TYPE text USING to_char("birthday", 'MM-DD');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_birthday_md_chk" CHECK ("users"."birthday" is null or "users"."birthday" ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$');
