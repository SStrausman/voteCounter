ALTER TABLE "roles" RENAME COLUMN "text" TO "description";--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "win_condition" text NOT NULL;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "partners" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL;