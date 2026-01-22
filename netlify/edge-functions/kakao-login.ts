/// <reference lib="deno.ns" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export default async (request: Request, context: any) => {
    // 1. Method Check
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
    }

    // 2. Environment Variables
    const supabaseUrl = Deno.env.get('VITE_PUBLIC_SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_KEY');
    const restApiKey = Deno.env.get('VITE_KAKAO_REST_API_KEY') || Deno.env.get('KAKAO_REST_API_KEY');
    const adminEmail = Deno.env.get('VITE_ADMIN_EMAIL');

    if (!supabaseUrl || !supabaseServiceKey || !restApiKey) {
        console.error('[kakao-login-edge] ❌ Missing environment variables');
        return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500 });
    }

    // 3. Initialize Supabase
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });

    try {
        const body = await request.json();
        const { code, redirectUri } = body;

        console.log('[kakao-login-edge] 🚀 Request received (Edge)');

        if (!code) {
            return new Response(JSON.stringify({ error: 'Missing authorization code' }), { status: 400 });
        }

        // 4. Token Exchange (Kakao)
        console.log('[kakao-login-edge] 1. Token Exchange');
        const tokenResponse = await fetch('https://kauth.kakao.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: restApiKey,
                redirect_uri: redirectUri,
                code: code,
            }),
        });

        const tokenData = await tokenResponse.json();
        if (!tokenResponse.ok) {
            console.error('[kakao-login-edge] Token exchange failed:', tokenData);
            return new Response(JSON.stringify({ error: 'Failed to exchange token', details: tokenData }), { status: 401 });
        }

        const { access_token: kakaoAccessToken, id_token: kakaoIdToken } = tokenData;

        // 5. User Info Retrieval (OIDC Optimization)
        let kakaoId: string = '';
        let email: string = '';
        let nickname: string = '';
        let profileImage: string | null = null;
        let realName: string | null = null;
        let phoneNumber: string | null = null;
        let usingOIDC = false;

        if (kakaoIdToken) {
            try {
                console.log('[kakao-login-edge] 🆔 ID Token found - Decoding');
                const payloadBase64 = kakaoIdToken.split('.')[1];
                // Deno/Web API Base64 Decode
                const binaryString = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'));
                const payloadDecoded = new TextDecoder().decode(Uint8Array.from(binaryString, c => c.charCodeAt(0)));
                const idTokenPayload = JSON.parse(payloadDecoded);

                if (idTokenPayload.sub) {
                    kakaoId = String(idTokenPayload.sub);
                    email = idTokenPayload.email || `kakao_${kakaoId}@example.com`;
                    nickname = idTokenPayload.nickname || 'Unknown User';
                    profileImage = idTokenPayload.picture || null;
                    usingOIDC = true;
                    console.log('[kakao-login-edge] ✅ OIDC Optimization Success');
                }
            } catch (e) {
                console.warn('[kakao-login-edge] ⚠️ OIDC Decode Failed:', e);
            }
        }

        if (!usingOIDC) {
            console.log('[kakao-login-edge] 2. User Info Fetch (Fallback)');
            const userResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
                headers: { Authorization: `Bearer ${kakaoAccessToken}` },
            });
            const userData = await userResponse.json();
            if (!userResponse.ok) {
                return new Response(JSON.stringify({ error: 'Failed to fetch user info', details: userData }), { status: 401 });
            }

            kakaoId = String(userData.id);
            const kakaoAccount = userData.kakao_account || {};
            email = kakaoAccount.email || `kakao_${kakaoId}@swingenjoy.com`;
            nickname = userData.properties?.nickname || kakaoAccount.profile?.nickname || `User${kakaoId}`;
            profileImage = userData.properties?.profile_image || kakaoAccount.profile?.profile_image_url;

            // 실명 및 전화번호 추출 추가
            realName = kakaoAccount.name || null;
            const phoneNumberRaw = kakaoAccount.phone_number || '';
            phoneNumber = phoneNumberRaw ? phoneNumberRaw.replace('+82 ', '0').replace(/-/g, '') : null;

            console.log(`[kakao-login-edge] 👤 User Info Extracted: name=${!!realName}, phone=${!!phoneNumber}`);
        }

        // 6. Supabase User Lookup/Creation (RPC Optimized: 1 RT)
        console.log('[kakao-login-edge] 3. Supabase User Check (RPC)');

        let userId: string | undefined;

        const { data: rpcData, error: rpcError } = await supabaseAdmin
            .rpc('get_kakao_user_info', { p_kakao_id: kakaoId })
            .maybeSingle();

        if (rpcData) {
            userId = rpcData.user_id;
            if (rpcData.email) email = rpcData.email;
            console.log('[kakao-login-edge] ✅ User found via RPC');
        } else {
            console.log('[kakao-login-edge] ⚠️ User not found via RPC');
        }

        if (!userId) {
            // Create new user
            console.log('[kakao-login-edge] Creating new user');
            const randomPassword = crypto.randomUUID();
            const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                email,
                password: randomPassword,
                email_confirm: true,
                user_metadata: {
                    name: nickname,
                    full_name: realName || nickname,
                    real_name: realName,
                    phone_number: phoneNumber,
                    kakao_id: kakaoId,
                    provider: 'kakao'
                }
            });
            if (createError && !createError.message?.includes('registered')) {
                throw createError;
            }
            if (newUser?.user) userId = newUser.user.id;
        }

        if (!userId) {
            // Fallback by email
            const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
            const userByEmail = listData?.users.find((u: any) => u.email === email);
            if (userByEmail) userId = userByEmail.id;
        }

        if (!userId) throw new Error('Could not determine User ID');

        // [중요] 기존 사용자든 신규 사용자든 메타데이터 최신화
        try {
            console.log(`[kakao-login-edge] 🔄 Updating Auth metadata for user: ${userId}`);
            await supabaseAdmin.auth.admin.updateUserById(userId, {
                user_metadata: {
                    kakao_id: kakaoId,
                    real_name: realName,
                    phone_number: phoneNumber,
                    full_name: realName || nickname,
                    provider: 'kakao'
                }
            });
            console.log('[kakao-login-edge] ✅ Auth metadata updated successfully');
        } catch (e) {
            console.error('[kakao-login-edge] ⚠️ Failed to update auth metadata:', e);
        }

        // 7. Parallel: Upsert & Session Generation
        console.log('[kakao-login-edge] 4. Parallel Processing (Database Sync)');

        const isNewUser = !rpcData;
        const updateData: any = {
            user_id: userId,
            kakao_id: kakaoId,
            nickname: nickname,
            real_name: realName,
            phone_number: phoneNumber,
            provider: 'kakao', // ✅ 프로바이더 명시
            updated_at: new Date().toISOString()
        };

        if (isNewUser && profileImage) {
            updateData.profile_image = profileImage;
            console.log('[kakao-login-edge] ✨ New User - Setting profile image');
        } else if (isNewUser) {
            console.log('[kakao-login-edge] ✨ New User - No profile image provided');
        } else {
            console.log(`[kakao-login-edge] 🔄 Existing User - Syncing social info (real_name: ${!!realName}, phone: ${!!phoneNumber})`);
        }

        const upsertPromise = supabaseAdmin.from('board_users').upsert(updateData, { onConflict: 'user_id' });

        const sessionPromise = (async () => {
            const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
                type: 'magiclink',
                email,
            });
            if (linkError) throw linkError;

            const sessionParams = new URL(linkData.properties.action_link).searchParams;
            const tokenHash = sessionParams.get('token');

            const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.verifyOtp({
                token_hash: tokenHash,
                type: 'magiclink'
            });
            if (sessionError) throw sessionError;
            return sessionData.session;
        })();

        const [_, session] = await Promise.all([upsertPromise, sessionPromise]);

        console.log('[kakao-login-edge] ✅ All Done');

        return new Response(JSON.stringify({
            success: true,
            email,
            name: nickname,
            isAdmin: email === adminEmail,
            session
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err: any) {
        console.error('[kakao-login-edge] Error:', err);
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
};
