ALTER TABLE "game_options" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "votes" RENAME COLUMN "user_id" TO "voter_id";--> statement-breakpoint
ALTER TABLE "votes" RENAME COLUMN "option_id" TO "target_player_id";--> statement-breakpoint
ALTER TABLE "votes" DROP CONSTRAINT "votes_option_id_game_options_id_fk";
--> statement-breakpoint
ALTER TABLE "votes" DROP CONSTRAINT "votes_user_id_users_id_fk";
--> statement-breakpoint
DROP TABLE "game_options" CASCADE;--> statement-breakpoint
DROP INDEX "votes_game_user_idx";--> statement-breakpoint
ALTER TABLE "votes" DROP CONSTRAINT "votes_pkey";--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_game_id_voter_id_pk" PRIMARY KEY("game_id","voter_id");--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_voter_id_users_id_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_target_player_id_users_id_fk" FOREIGN KEY ("target_player_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" DROP COLUMN "id";