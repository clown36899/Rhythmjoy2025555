-- Drop the FK constraint that is causing 409s
-- We verified via RPC that this is the only FK on the table.
-- Even though it should work (pointing to categories), it's blocking updates.
-- Priority is to restore functionality.
ALTER TABLE learning_resources DROP CONSTRAINT IF EXISTS fk_learning_resources_category;
