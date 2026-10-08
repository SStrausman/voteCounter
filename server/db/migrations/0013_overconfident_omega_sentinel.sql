ALTER TABLE "game_members" ADD COLUMN "game_role" uuid;--> statement-breakpoint
ALTER TABLE "game_members" ADD COLUMN "partners" uuid[];--> statement-breakpoint
ALTER TABLE "game_members" ADD CONSTRAINT "game_members_game_role_roles_id_fk" FOREIGN KEY ("game_role") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" DROP COLUMN "partners";