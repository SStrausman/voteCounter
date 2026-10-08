CREATE TABLE "game_roles" (
	"game_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"role_id" uuid NOT NULL,
	CONSTRAINT "game_roles_game_id_position_pk" PRIMARY KEY("game_id","position")
);
--> statement-breakpoint
ALTER TABLE "game_roles" ADD CONSTRAINT "game_roles_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_roles" ADD CONSTRAINT "game_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;