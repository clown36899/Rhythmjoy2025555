-- Add status and deleted_at columns to board_users for Soft Delete
ALTER TABLE board_users 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Create function to handle user withdrawal (Anonymization)
-- This "unregisters" the user within our service while keeping logs intact
CREATE OR REPLACE FUNCTION handle_user_withdrawal(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE board_users
    SET 
        nickname = '탈퇴한 사용자',
        real_name = NULL,
        phone_number = NULL,
        kakao_id = NULL,
        profile_image = NULL,
        gender = NULL,
        age_range = NULL,
        status = 'deleted',
        deleted_at = NOW(),
        updated_at = NOW()
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
