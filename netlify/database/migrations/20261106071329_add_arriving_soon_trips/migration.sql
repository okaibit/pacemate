ALTER TABLE "profiles" ADD COLUMN "next_city" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "next_arrival" date;--> statement-breakpoint
CREATE INDEX "profiles_next_city_idx" ON "profiles" (lower("next_city"));