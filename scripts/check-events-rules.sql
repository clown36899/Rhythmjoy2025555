SELECT 
    schemaname, 
    tablename, 
    rulename, 
    definition 
FROM 
    pg_rules 
WHERE 
    tablename = 'events';
