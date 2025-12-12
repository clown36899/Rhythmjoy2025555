-- Update the RPC function to support new columns
-- Run this in Supabase SQL Editor

-- Drop the old function first to avoid signature conflicts
DROP FUNCTION IF EXISTS update_social_schedule_with_password(bigint, text, text, text, text, text, text, integer, text, text, text);
DROP FUNCTION IF EXISTS update_social_schedule_with_password(bigint, text, text, date, text, text, text, integer, text, text, text);

-- Create the new function without date, start_time, end_time parameters
CREATE OR REPLACE FUNCTION update_social_schedule_with_password(
  p_schedule_id bigint,
  p_password text,
  p_title text,
  p_description text DEFAULT NULL,
  p_day_of_week integer DEFAULT NULL,
  p_inquiry_contact text DEFAULT NULL,
  p_link_name text DEFAULT NULL,
  p_link_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_password text;
BEGIN
  -- Check password
  SELECT password INTO v_password
  FROM social_schedules
  WHERE id = p_schedule_id;

  IF v_password != p_password THEN
    RAISE EXCEPTION 'Password does not match';
  END IF;

  -- Update record (date is not updated for weekly schedules)
  UPDATE social_schedules
  SET
    title = p_title,
    description = p_description,
    day_of_week = p_day_of_week,
    inquiry_contact = p_inquiry_contact,
    link_name = p_link_name,
    link_url = p_link_url
  WHERE id = p_schedule_id;
END;
$$;
