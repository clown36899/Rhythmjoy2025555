-- Drop first to allow return type change
DROP FUNCTION IF EXISTS get_table_constraints(text);

-- Create a function to inspect constraints (Fixed Types)
CREATE OR REPLACE FUNCTION get_table_constraints(t_name text)
RETURNS TABLE (
    constraint_name text,
    constraint_type text,
    table_name text
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        conname::text,
        contype::text,
        relname::text
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = t_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
