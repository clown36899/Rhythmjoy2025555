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
        console.log('[admin-get-user-info] 🚀 요청 수신');
        const { targetUserId, masterPassword, currentAdminToken } = JSON.parse(event.body || '{}');

        console.log('[admin-get-user-info] 요청 파라미터:', {
            hasTargetUserId: !!targetUserId,
            hasMasterPassword: !!masterPassword,
            hasCurrentAdminToken: !!currentAdminToken,
            targetUserIdPreview: targetUserId ? targetUserId.substring(0, 8) + '...' : null
        });

        if (!targetUserId || !masterPassword || !currentAdminToken) {
            console.error('[admin-get-user-info] ❌ 필수 정보 누락');
            return { statusCode: 400, body: JSON.stringify({ error: '필수 정보 누락' }) };
        }

        // 1. 관리자 권한 확인
        console.log('[admin-get-user-info] 1단계: 관리자 권한 확인 시작');
        // 클라이언트에서 보낸 토큰이 유효하고, 그 유저가 admin 이메일인지 확인
        const { data: { user: adminUser }, error: userError } = await supabaseAdmin.auth.getUser(currentAdminToken);

        console.log('[admin-get-user-info] 관리자 토큰 검증 결과:', {
            hasAdminUser: !!adminUser,
            adminEmail: adminUser?.email,
            expectedAdminEmail: adminEmail,
            isMatch: adminUser?.email === adminEmail,
            hasError: !!userError
        });

        if (userError || !adminUser || adminUser.email !== adminEmail) {
            console.error('[admin-get-user-info] ❌ 관리자 권한 없음');
            return { statusCode: 403, body: JSON.stringify({ error: '관리자 권한이 없습니다.' }) };
        }

        console.log('[admin-get-user-info] ✅ 관리자 권한 확인 완료');

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
        console.log('[admin-get-user-info] 3단계: Private Key 복호화 시작');
        const salt = keyData.salt;
        const finalIv = Buffer.from(keyData.iv, 'hex');
        const [encryptedKeyData, authTagHex] = keyData.encrypted_private_key.split(':');

        console.log('[admin-get-user-info] 키 데이터 파싱:', {
            hasSalt: !!salt,
            hasIv: !!finalIv,
            hasEncryptedKeyData: !!encryptedKeyData,
            hasAuthTag: !!authTagHex
        });

        if (!encryptedKeyData || !authTagHex) {
            console.error('[admin-get-user-info] ❌ 키 데이터 손상됨');
            return { statusCode: 500, body: JSON.stringify({ error: '키 데이터 손상됨' }) };
        }

        // Key Derivation (PBKDF2)
        console.log('[admin-get-user-info] PBKDF2 키 유도 시작...');
        const derivedKey = crypto.pbkdf2Sync(masterPassword, salt, 100000, 32, 'sha256');
        console.log('[admin-get-user-info] ✅ 키 유도 완료');

        // Decrypt
        console.log('[admin-get-user-info] Private Key 복호화 시도...');
        const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, finalIv);
        decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

        let privateKey: string;
        try {
            let decrypted = decipher.update(encryptedKeyData, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            privateKey = decrypted;
            console.log('[admin-get-user-info] ✅ Private Key 복호화 성공');
        } catch (decryptError) {
            console.error('[admin-get-user-info] ❌ Private key 복호화 실패 (Wrong Password):', decryptError);
            return { statusCode: 401, body: JSON.stringify({ error: '비밀번호가 올바르지 않습니다.' }) };
        }

        // 4. 타겟 유저의 암호화된 토큰(Refresy/Access) 가져오기
        console.log(`[admin-get-user-info] Searching for token. targetUserId: "${targetUserId}" (length: ${targetUserId?.length})`);

        // 디버깅: 전체 토큰 개수 확인 (서버 로그용)
        const { count, error: countError } = await supabaseAdmin
            .from('user_tokens')
            .select('*', { count: 'exact', head: true });
        console.log(`[admin-get-user-info] Current total tokens in DB: ${count}, CountError:`, countError);

        const { data: tokenData, error: tokenError } = await supabaseAdmin
            .from('user_tokens')
            .select('encrypted_token')
            .eq('user_id', targetUserId)
            .single();

        if (tokenError || !tokenData) {
            console.warn(`[admin-get-user-info] Token NOT FOUND for user: ${targetUserId}. Error:`, tokenError);
            return {
                statusCode: 404,
                body: JSON.stringify({
                    error: `해당 유저(ID: ${targetUserId.substring(0, 8)}...)의 보안 토큰을 찾을 수 없습니다. 사용자가 최근 로그인 과정에서 카카오 인증 정보를 시스템에 등록하지 않았을 수 있습니다. (재로그인 필요)`,
                    details: tokenError?.message
                })
            };
        }

        // 5. Private Key로 유저 토큰 복호화
        console.log('[admin-get-user-info] 5단계: 유저 토큰 복호화 시작');
        let userToken: string;
        try {
            const buffer = Buffer.from(tokenData.encrypted_token, 'base64');
            console.log('[admin-get-user-info] 암호화된 토큰 길이:', buffer.length);

            const decryptedBuffer = crypto.privateDecrypt(
                {
                    key: privateKey,
                    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                },
                buffer
            );
            userToken = decryptedBuffer.toString('utf8');
            console.log('[admin-get-user-info] ✅ 토큰 복호화 성공, 토큰 길이:', userToken.length);
        } catch (tokenDecryptError) {
            console.error('[admin-get-user-info] ❌ 토큰 복호화 실패:', tokenDecryptError);
            return { statusCode: 500, body: JSON.stringify({ error: '토큰 복호화 실패' }) };
        }

        // 6. 카카오 API로 실명/전화번호 조회
        console.log('[admin-get-user-info] 6단계: 카카오 API 호출 준비');
        // 토큰이 AccessToken인지 RefreshToken인지 모름. 일단 AccessToken으로 시도해보고 안되면 Refresh 시도?
        // 하지만 저장할 때 RefreshToken을 우선저장했으므로 RefreshToken일 확률 높음.
        // Refresh Token으로 Access Token 갱신 시도

        let accessTokenForApi = userToken;

        // Refresh Token이라고 가정하고 갱신 시도
        console.log('[admin-get-user-info] Refresh Token으로 Access Token 갱신 시도...');
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

            console.log('[admin-get-user-info] 토큰 갱신 응답:', {
                status: tokenResponse.status,
                ok: tokenResponse.ok
            });

            if (tokenResponse.ok) {
                const tokenJson: any = await tokenResponse.json();
                accessTokenForApi = tokenJson.access_token;
                console.log('[admin-get-user-info] ✅ Access Token 갱신 성공');
            } else {
                // 갱신 실패하면 Access Token일 수도 있으니 그냥 진행해봄 (만료되었으면 실패하겠지)
                console.log('[admin-get-user-info] ⚠️ Refresh token refresh failed, trying as Access Token directly');
            }
        }

        // 7. 조회 (v2/user/me)
        console.log('[admin-get-user-info] 7단계: 카카오 사용자 정보 조회 시작');
        const userResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
            headers: { Authorization: `Bearer ${accessTokenForApi}` }
        });

        console.log('[admin-get-user-info] 카카오 API 응답:', {
            status: userResponse.status,
            ok: userResponse.ok
        });

        if (!userResponse.ok) {
            console.error('[admin-get-user-info] ❌ 카카오 회원정보 조회 실패');
            return { statusCode: 502, body: JSON.stringify({ error: '카카오 회원정보 조회 실패 (토큰 만료)' }) };
        }

        const userJson: any = await userResponse.json();
        const account = userJson.kakao_account || {};

        console.log('[admin-get-user-info] ✅ 사용자 정보 조회 성공');
        console.log('[admin-get-user-info] 조회된 데이터:', {
            hasName: !!account.name,
            hasPhone: !!account.phone_number,
            hasEmail: !!account.email,
            hasGender: !!account.gender,
            hasBirthyear: !!account.birthyear,
            hasBirthday: !!account.birthday
        });

        const safeInfo = {
            name: account.name || account.profile?.nickname || 'Unknown',
            phone: account.phone_number ? account.phone_number.replace('+82 ', '0').replace(/-/g, '-') : '없음',
            email: account.email,
            gender: account.gender,
            birthyear: account.birthyear,
            birthday: account.birthday
        };

        console.log('[admin-get-user-info] 🎉 요청 완료');

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, info: safeInfo })
        };

    } catch (err: any) {
        console.error('Server error:', err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};
