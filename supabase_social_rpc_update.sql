-- Update the RPC function to support new columns
-- Run this in Supabase SQL Editor

CREATE OR REPLACE FUNCTION update_social_schedule_with_password(
  p_schedule_id bigint,
  p_password text,
  p_title text,
  p_date text, -- Keeping for compatibility, can be null
  p_start_time text,
  p_end_time text,
  p_description text,
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

  -- Update record
  UPDATE social_schedules
  SET
    title = p_title,
    date = p_date,
    start_time = p_start_time,
    end_time = p_end_time,
    description = p_description,
    day_of_week = p_day_of_week,
    inquiry_contact = p_inquiry_contact,
    link_name = p_link_name,
    link_url = p_link_url
  WHERE id = p_schedule_id;
END;
$$;
