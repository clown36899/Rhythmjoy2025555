import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

let supabaseAdmin: any = null;

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
    const adminEmail = process.env.VITE_ADMIN_EMAIL;
    // 카카오 Client ID (REST API Key) - 환경변수 설정 필수!
    const kakaoClientId = process.env.KAKAO_CLIENT_ID || '4f36c4e35ab80c9bff7850e63341daa6';

    if (!supabaseUrl || !supabaseServiceKey) return { statusCode: 500, body: 'Config Error' };

    if (!supabaseAdmin) {
        supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    }

    try {
        const { targetUserId, masterPassword, currentAdminToken } = JSON.parse(event.body || '{}');

        if (!targetUserId || !masterPassword || !currentAdminToken) {
            return { statusCode: 400, body: JSON.stringify({ error: '필수 정보 누락' }) };
        }

        // 1. 관리자 권한 확인
        // 클라이언트에서 보낸 토큰이 유효하고, 그 유저가 admin 이메일인지 확인
        const { data: { user: adminUser }, error: userError } = await supabaseAdmin.auth.getUser(currentAdminToken);

        if (userError || !adminUser || adminUser.email !== adminEmail) {
            return { statusCode: 403, body: JSON.stringify({ error: '관리자 권한이 없습니다.' }) };
        }

        // 2. 시스템 암호화 키(Private Key) 가져오기
        const { data: keyData, error: keyError } = await supabaseAdmin
            .from('system_keys') // public schema
            .select('*')
            .eq('id', 1)
            .single();

        if (keyError || !keyData) {
            return { statusCode: 500, body: JSON.stringify({ error: '보안 키를 찾을 수 없습니다.' }) };
        }

        // 3. Master Password로 Private Key 복호화 (AES-256-GCM)
        const salt = keyData.salt;
        const finalIv = Buffer.from(keyData.iv, 'hex');
        const [encryptedKeyData, authTagHex] = keyData.encrypted_private_key.split(':');

        if (!encryptedKeyData || !authTagHex) {
            return { statusCode: 500, body: JSON.stringify({ error: '키 데이터 손상됨' }) };
        }

        // Key Derivation (PBKDF2)
        const derivedKey = crypto.pbkdf2Sync(masterPassword, salt, 100000, 32, 'sha256');

        // Decrypt
        const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, finalIv);
        decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

        let privateKey: string;
        try {
            let decrypted = decipher.update(encryptedKeyData, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            privateKey = decrypted;
        } catch (decryptError) {
            console.warn('Private key decryption failed (Wrong Password)');
            return { statusCode: 401, body: JSON.stringify({ error: '비밀번호가 올바르지 않습니다.' }) };
        }

        // 4. 타겟 유저의 암호화된 토큰(Refresy/Access) 가져오기
        const { data: tokenData, error: tokenError } = await supabaseAdmin
            .from('user_tokens')
            .select('encrypted_token')
            .eq('user_id', targetUserId)
            .single();

        if (tokenError || !tokenData) {
            return { statusCode: 404, body: JSON.stringify({ error: '해당 유저의 보안 토큰이 없습니다. (재로그인 필요)' }) };
        }

        // 5. Private Key로 유저 토큰 복호화
        let userToken: string;
        try {
            const buffer = Buffer.from(tokenData.encrypted_token, 'base64');
            const decryptedBuffer = crypto.privateDecrypt(
                {
                    key: privateKey,
                    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                },
                buffer
            );
            userToken = decryptedBuffer.toString('utf8');
        } catch (tokenDecryptError) {
            console.error('Token decryption failed:', tokenDecryptError);
            return { statusCode: 500, body: JSON.stringify({ error: '토큰 복호화 실패' }) };
        }

        // 6. 카카오 API로 실명/전화번호 조회
        // 토큰이 AccessToken인지 RefreshToken인지 모름. 일단 AccessToken으로 시도해보고 안되면 Refresh 시도?
        // 하지만 저장할 때 RefreshToken을 우선저장했으므로 RefreshToken일 확률 높음.
        // Refresh Token으로 Access Token 갱신 시도

        let accessTokenForApi = userToken;

        // Refresh Token이라고 가정하고 갱신 시도
        if (kakaoClientId) {
            const tokenResponse = await fetch('https://kauth.kakao.com/oauth/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    client_id: kakaoClientId,
                    refresh_token: userToken
                })
            });

            if (tokenResponse.ok) {
                const tokenJson: any = await tokenResponse.json();
                accessTokenForApi = tokenJson.access_token;
            } else {
                // 갱신 실패하면 Access Token일 수도 있으니 그냥 진행해봄 (만료되었으면 실패하겠지)
                console.log('Refresh token refresh failed, trying as Access Token directly');
            }
        }

        // 7. 조회 (v2/user/me)
        const userResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
            headers: { Authorization: `Bearer ${accessTokenForApi}` }
        });

        if (!userResponse.ok) {
            return { statusCode: 502, body: JSON.stringify({ error: '카카오 회원정보 조회 실패 (토큰 만료)' }) };
        }

        const userJson: any = await userResponse.json();
        const account = userJson.kakao_account || {};

        const safeInfo = {
            name: account.name || account.profile?.nickname || 'Unknown',
            phone: account.phone_number ? account.phone_number.replace('+82 ', '0').replace(/-/g, '-') : '없음',
            email: account.email,
            gender: account.gender,
            birthyear: account.birthyear,
            birthday: account.birthday
        };

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, info: safeInfo })
        };

    } catch (err: any) {
        console.error('Server error:', err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};
