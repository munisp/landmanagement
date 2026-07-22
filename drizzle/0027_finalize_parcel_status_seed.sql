-- PostgreSQL commits new enum labels only at the end of the migration transaction.
-- Migration 0012 therefore seeds using pre-existing labels; this forward migration
-- restores the intended lifecycle states after the enum labels are usable.

UPDATE "parcels"
SET "status" = CASE "parcel_id"
  WHEN 'LG-VI-2024-001' THEN 'verified'::"parcel_status"
  WHEN 'KN-KN-2024-003' THEN 'pending_verification'::"parcel_status"
  WHEN 'LG-IK-2024-004' THEN 'verified'::"parcel_status"
  WHEN 'AB-MA-2024-005' THEN 'verified'::"parcel_status"
  ELSE "status"
END
WHERE "parcel_id" IN ('LG-VI-2024-001', 'KN-KN-2024-003', 'LG-IK-2024-004', 'AB-MA-2024-005');
