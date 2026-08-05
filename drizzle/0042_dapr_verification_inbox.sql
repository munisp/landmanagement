CREATE TYPE dapr_inbox_delivery_status AS ENUM ('received', 'processed', 'failed');

CREATE TABLE dapr_inbox_deliveries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cloud_event_id VARCHAR(255) NOT NULL UNIQUE,
  topic VARCHAR(255) NOT NULL,
  event_type VARCHAR(255) NOT NULL,
  payload_sha256 CHAR(64) NOT NULL,
  status dapr_inbox_delivery_status NOT NULL DEFAULT 'received',
  workflow_id VARCHAR(255),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX dapr_inbox_deliveries_status_received_idx
  ON dapr_inbox_deliveries (status, received_at);
