-- Fix duplicate key error by syncing the ID sequence
-- This happens because we copied data manually, so the auto-increment counter didn't update.
-- This SQL forces the counter to jump to the max existing ID + 1.

SELECT setval(
    pg_get_serial_sequence('board_prefixes', 'id'), 
    coalesce(max(id), 0) + 1, 
    false
) FROM board_prefixes;
