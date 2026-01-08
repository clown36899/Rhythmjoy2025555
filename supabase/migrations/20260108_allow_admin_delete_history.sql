-- ============================================================================
-- Allow Admins to Update/Delete History Nodes & Edges
-- ============================================================================
-- Created: 2026-01-08
-- Purpose: Allow users in 'board_admins' to manage all history content
-- ============================================================================

-- 1. Update Policies for history_nodes

-- Drop existing restricted policies
DROP POLICY IF EXISTS "Creators can update their nodes" ON history_nodes;
DROP POLICY IF EXISTS "Creators can delete their nodes" ON history_nodes;

-- Create new inclusive policies (Creator OR Admin)
CREATE POLICY "Creators and Admins can update nodes"
  ON history_nodes FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = created_by OR 
    EXISTS (SELECT 1 FROM board_admins WHERE user_id = auth.uid())
  );

CREATE POLICY "Creators and Admins can delete nodes"
  ON history_nodes FOR DELETE
  TO authenticated
  USING (
    auth.uid() = created_by OR 
    EXISTS (SELECT 1 FROM board_admins WHERE user_id = auth.uid())
  );

-- 2. Update Policies for history_edges

-- Drop existing restricted policies
DROP POLICY IF EXISTS "Creators can update their edges" ON history_edges;
DROP POLICY IF EXISTS "Creators can delete their edges" ON history_edges;

-- Create new inclusive policies (Creator OR Admin)
CREATE POLICY "Creators and Admins can update edges"
  ON history_edges FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = created_by OR 
    EXISTS (SELECT 1 FROM board_admins WHERE user_id = auth.uid())
  );

CREATE POLICY "Creators and Admins can delete edges"
  ON history_edges FOR DELETE
  TO authenticated
  USING (
    auth.uid() = created_by OR 
    EXISTS (SELECT 1 FROM board_admins WHERE user_id = auth.uid())
  );
