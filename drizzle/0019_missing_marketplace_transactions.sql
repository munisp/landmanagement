CREATE TABLE IF NOT EXISTS "marketplace_bids" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "marketplace_bids_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  "listing_id" integer NOT NULL,
  "bidder_id" integer NOT NULL,
  "amount" bigint NOT NULL,
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "marketplace_escrow" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "marketplace_escrow_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  "listing_id" integer NOT NULL,
  "seller_id" integer NOT NULL,
  "buyer_id" integer NOT NULL,
  "amount" bigint NOT NULL,
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "contract_address" varchar(128),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "marketplace_favorites" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "marketplace_favorites_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  "user_id" integer NOT NULL,
  "listing_id" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "marketplace_listings" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "marketplace_listings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  "parcel_id" integer NOT NULL,
  "seller_id" integer NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" text NOT NULL,
  "price" bigint NOT NULL,
  "status" varchar(32) DEFAULT 'active' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transactions" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "transactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  "type" varchar(64) NOT NULL,
  "parcel_id" integer NOT NULL,
  "initiator_id" integer NOT NULL,
  "initiator_name" varchar(255) NOT NULL,
  "counterparty_name" varchar(255),
  "title_id" integer,
  "status" varchar(32) DEFAULT 'pending_approval' NOT NULL,
  "consideration_amount" bigint DEFAULT 0 NOT NULL,
  "workflow_stage" varchar(64) DEFAULT 'submission' NOT NULL,
  "payment_status" varchar(16) DEFAULT 'unpaid' NOT NULL,
  "document_status" varchar(16) DEFAULT 'pending' NOT NULL,
  "external_reference" varchar(128),
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
