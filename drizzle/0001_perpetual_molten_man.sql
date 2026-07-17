CREATE TYPE "public"."parcel_status" AS ENUM('draft', 'registered', 'transferred', 'disputed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('initiated', 'pending', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('sale', 'transfer', 'lease', 'mortgage', 'gift');--> statement-breakpoint
CREATE TABLE "parcels" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "parcels_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parcel_id" varchar(64) NOT NULL,
	"owner_id" integer NOT NULL,
	"address" text NOT NULL,
	"city" varchar(128),
	"state" varchar(128),
	"country" varchar(128) DEFAULT 'Nigeria' NOT NULL,
	"latitude" varchar(20),
	"longitude" varchar(20),
	"area" integer,
	"land_use" varchar(64),
	"status" "parcel_status" DEFAULT 'draft' NOT NULL,
	"title_number" varchar(64),
	"survey_plan_number" varchar(64),
	"registration_date" timestamp,
	"last_transfer_date" timestamp,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "parcels_parcel_id_unique" UNIQUE("parcel_id")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "transactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"transaction_id" varchar(64) NOT NULL,
	"parcel_id" integer NOT NULL,
	"from_user_id" integer NOT NULL,
	"to_user_id" integer NOT NULL,
	"transaction_type" "transaction_type" NOT NULL,
	"status" "transaction_status" DEFAULT 'initiated' NOT NULL,
	"amount" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'NGN' NOT NULL,
	"payment_method" varchar(64),
	"payment_reference" varchar(128),
	"blockchain_tx_hash" varchar(128),
	"initiated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"failed_at" timestamp,
	"cancelled_at" timestamp,
	"failure_reason" text,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "parcels_owner_idx" ON "parcels" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "parcels_parcel_id_idx" ON "parcels" USING btree ("parcel_id");--> statement-breakpoint
CREATE INDEX "parcels_status_idx" ON "parcels" USING btree ("status");--> statement-breakpoint
CREATE INDEX "transactions_parcel_idx" ON "transactions" USING btree ("parcel_id");--> statement-breakpoint
CREATE INDEX "transactions_from_user_idx" ON "transactions" USING btree ("from_user_id");--> statement-breakpoint
CREATE INDEX "transactions_to_user_idx" ON "transactions" USING btree ("to_user_id");--> statement-breakpoint
CREATE INDEX "transactions_status_idx" ON "transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "transactions_transaction_id_idx" ON "transactions" USING btree ("transaction_id");