ALTER TABLE "roles" ADD COLUMN "alignment" text;--> statement-breakpoint
UPDATE "roles" SET "alignment" = 'Town' WHERE "name" = 'Vanilla Townie';--> statement-breakpoint
ALTER TABLE "roles" ALTER COLUMN "alignment" SET NOT NULL;