-- Fix handle_user_withdrawal function type mismatch (UUID vs TEXT)
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
    -- Cast p_user_id to text because board_users.user_id is likely TEXT
    WHERE user_id::text = p_user_id::text; 
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
