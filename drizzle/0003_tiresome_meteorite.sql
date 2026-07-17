CREATE TABLE "user_preferences" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_preferences_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"theme" varchar(20) DEFAULT 'system' NOT NULL,
	"language" varchar(10) DEFAULT 'en' NOT NULL,
	"timezone" varchar(50) DEFAULT 'Africa/Lagos' NOT NULL,
	"date_format" varchar(20) DEFAULT 'DD/MM/YYYY' NOT NULL,
	"currency" varchar(10) DEFAULT 'NGN' NOT NULL,
	"notification_settings" jsonb DEFAULT '{"email":true,"sms":true,"push":true,"transactionUpdates":true,"systemAlerts":true}'::jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_preferences_user_idx" ON "user_preferences" USING btree ("user_id");