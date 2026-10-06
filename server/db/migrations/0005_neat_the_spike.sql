ALTER TABLE "games" ADD COLUMN "total_players" integer;
UPDATE "games" SET "total_players" = 13;
ALTER TABLE "games" ALTER COLUMN "total_players" SET NOT NULL;