-- AlterTable: Remove Discord webhook URL (now using direct messages instead)
ALTER TABLE "users" DROP COLUMN "discordWebhookUrl";
