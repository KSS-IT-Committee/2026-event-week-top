CREATE TYPE "public"."role" AS ENUM('IT', 'Sousakuten', 'Taiikusai');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "roles" "role"[] DEFAULT '{}' NOT NULL;