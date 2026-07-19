-- Anonymous audit events (e.g. failed logins, rejected API keys) have no
-- attributable user, so activity_logs.userId must accept NULL.
ALTER TABLE "activity_logs" ALTER COLUMN "userId" DROP NOT NULL;
