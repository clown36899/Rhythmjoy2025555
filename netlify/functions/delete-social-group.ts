import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;
const supabaseAnonKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY!;
const adminEmailEnv = process.env.VITE_ADMIN_EMAIL;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const handler: Handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: '' };
    }

    try {
        const { groupId, password } = JSON.parse(event.body || '{}');
        console.log(`[delete-social-group] 🔥 Request received for Group ID: ${groupId}`);

        if (!groupId) {
            console.error('[delete-social-group] Missing groupId in request body');
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Group ID is required.' })
            };
        }

        // 1. DB에서 단체 정보 조회
        console.log(`[delete-social-group] 🔍 Fetching group ${groupId} details...`);
        const { data: groupData, error: fetchError } = await supabaseAdmin
            .from('social_groups')
            .select('password, storage_path, user_id, name')
            .eq('id', groupId)
            .single();

        if (fetchError) {
            console.log(`[delete-social-group] ℹ️ Group ${groupId} not found (might already be deleted):`, fetchError.message);
            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Group already deleted or not found.' })
            };
        }

        if (!groupData) {
            console.log(`[delete-social-group] ℹ️ Group ${groupId} returned no data.`);
            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Group not found.' })
            };
        }

        console.log(`[delete-social-group] ✅ Group found: "${groupData.name}" (Storage Path: ${groupData.storage_path}, Created By: ${groupData.user_id})`);

        // 2. 권한 확인
        let isAuthorized = false;
        let authReason = "";
        const authHeader = event.headers.authorization;

        if (authHeader) {
            console.log(`[delete-social-group] 🔑 Auth header present, verifying token...`);
            const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
                global: { headers: { Authorization: authHeader } },
                auth: { persistSession: false }
            });
            const { data: { user }, error: userError } = await userSupabase.auth.getUser();

            if (userError) {
                console.error(`[delete-social-group] ❌ User verification failed:`, userError.message);
            }

            if (user) {
                console.log(`[delete-social-group] 👤 Authenticated user: ${user.id} (${user.email})`);

                // 관리자 권한 확인
                const isAdmin = user.app_metadata?.is_admin === true ||
                    (adminEmailEnv && user.email === adminEmailEnv);

                if (isAdmin) {
                    console.log(`[delete-social-group] 🎖️ Authorized as ADMIN`);
                    isAuthorized = true;
                    authReason = "Admin Privileges";
                }

                if (groupData.user_id && user.id === groupData.user_id) {
                    console.log(`[delete-social-group] 🎖️ Authorized as OWNER`);
                    isAuthorized = true;
                    authReason = "Resource Owner";
                }
            }
        }

        // 비밀번호 확인 (비로그인/대리 삭제용 - 소셜 단체도 비밀번호가 있다면 활용)
        if (!isAuthorized && groupData.password) {
            console.log(`[delete-social-group] 🔐 Checking password authorization...`);
            if (groupData.password === password) {
                console.log(`[delete-social-group] 🎖️ Authorized via PASSWORD`);
                isAuthorized = true;
                authReason = "Valid Password";
            } else {
                console.log(`[delete-social-group] ❌ Password mismatch.`);
            }
        }

        if (!isAuthorized) {
            console.warn(`[delete-social-group] 🚫 Unauthorized deletion attempt for Group ${groupId}`);
            return {
                statusCode: 403,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Unauthorized.' })
            };
        }

        console.log(`[delete-social-group] 🚀 Starting deletion process (Reason: ${authReason})...`);

        // 3. 종속 데이터는 DB의 CASCADE 설정에 맡기거나 여기서 명시적으로 삭제
        // social_schedules, social_comments 등이 있을 수 있음.
        // 여기서는 이미지 삭제에 집중하고, DB 삭제 시 Cascade가 작동한다고 가정하거나, 필요하다면 추가 클린업

        // 4. 스토리지 파일 삭제 (v2 방식: 폴더 통째로 삭제)
        if (groupData.storage_path) {
            console.log(`[delete-social-group] 📦 Attempting folder cleanup: ${groupData.storage_path}`);
            try {
                // 폴더 내 파일 목록 조회
                // 1. 프로필 이미지 폴더
                const profilePath = `${groupData.storage_path}/profile`;
                // 2. 일정 이미지 폴더
                const schedulePath = `${groupData.storage_path}/schedules`;

                // 재귀적 삭제가 안되므로, list로 찾아서 지워야 함.
                // 하지만 Supabase Storage API remove는 폴더 경로를 지원하지 않을 수 있어, 파일 리스트를 가져와야 함.
                // 루트 폴더(groupData.storage_path)를 list하면 직계 자식만 나오므로, 재귀적으로 찾아야 할 수도 있음.
                // 하지만 현재 구조상 2 depth 정도임.

                // 단순하게: storage_path 자체를 list해서 나오는 것들 삭제 (직계 파일이 있다면)
                // 그리고 profile, schedules 폴더 내부도 확인

                // Helper to list all files recursively (naive implementation for known depth)
                const getAllFiles = async (prefix: string) => {
                    let allFiles: string[] = [];
                    // 1. List root of prefix
                    const { data: rootFiles } = await supabaseAdmin.storage.from('images').list(prefix);
                    if (rootFiles) {
                        for (const f of rootFiles) {
                            // id가 없으면 폴더일 확률이 높음 (Supabase Storage 특성)
                            // 하지만 확실하게 하기 위해 이름으로 추측하거나, 재귀 호출
                            // Supabase list API returns metadata using 'id' for files usually.
                            // Folders might not have IDs in some versions or be returned differently.
                            // Let's assume standard structure: profile/, schedules/

                            if (!f.id) { // It's likely a folder
                                const subFiles = await getAllFiles(`${prefix}/${f.name}`);
                                allFiles = [...allFiles, ...subFiles];
                            } else {
                                allFiles.push(`${prefix}/${f.name}`);
                            }
                        }
                    }
                    return allFiles;
                };

                // NOTE: Supabase Storage list behavior on folders is tricky.
                // Instead of complex recursive logic which might be slow or buggy:
                // We know the structure:
                // storage_path/profile/*
                // storage_path/schedules/*/* (timestamp folders for schedules)

                // Let's try aggressive clean up based on known subfolders + root

                // 1. Profile images
                const { data: profileFiles } = await supabaseAdmin.storage.from('images').list(`${groupData.storage_path}/profile`);
                if (profileFiles && profileFiles.length > 0) {
                    const paths = profileFiles.map(f => `${groupData.storage_path}/profile/${f.name}`);
                    await supabaseAdmin.storage.from('images').remove(paths);
                    console.log(`[delete-social-group] 🗑️ Removed profile images:`, paths);
                }

                // 2. Schedule images
                // schedules folder might contain subfolders (one per schedule if we did that, or just files)
                // In proposed plan: {parent_storage_path}/schedules/{timestamp}_{random}/...
                // So we need to list schedules/ first to get schedule folders
                const { data: scheduleFolders } = await supabaseAdmin.storage.from('images').list(`${groupData.storage_path}/schedules`);
                if (scheduleFolders) {
                    for (const folder of scheduleFolders) {
                        // it's a schedule folder (e.g. 1704..._abcde)
                        const scheduleBasePath = `${groupData.storage_path}/schedules/${folder.name}`;
                        const { data: sFiles } = await supabaseAdmin.storage.from('images').list(scheduleBasePath);
                        if (sFiles && sFiles.length > 0) {
                            const sPaths = sFiles.map(f => `${scheduleBasePath}/${f.name}`);
                            await supabaseAdmin.storage.from('images').remove(sPaths);
                            console.log(`[delete-social-group] 🗑️ Removed schedule images in ${folder.name}`);
                        }
                    }
                }

                // 3. Remove any loose files in root (unlikely but safe)
                const { data: rootFiles } = await supabaseAdmin.storage.from('images').list(groupData.storage_path);
                if (rootFiles && rootFiles.length > 0) {
                    const rootPaths = rootFiles.filter(f => !!f.id).map(f => `${groupData.storage_path}/${f.name}`);
                    if (rootPaths.length > 0) {
                        await supabaseAdmin.storage.from('images').remove(rootPaths);
                    }
                }

                console.log(`[delete-social-group] ✅ Folder cleanup complete`);

            } catch (folderError) {
                console.error(`[delete-social-group] ⚠️ Folder cleanup Error:`, folderError);
            }
        } else {
            console.log(`[delete-social-group] ℹ️ No storage_path. Attempting legacy fallback (optional).`);
            // Legacy fallback: Delete images based on user_id path if needed, but it's hard to guess without full scanning.
            // We'll skip legacy cleanup for now as requested to focus on new structure, 
            // or rely on user_id based manual cleanup if necessary.
        }

        // 5. 단체 최종 삭제
        console.log(`[delete-social-group] 💥 Finally deleting group record ${groupId} from DB...`);
        const { error: deleteError } = await supabaseAdmin.from('social_groups').delete().eq('id', groupId);

        if (deleteError) {
            console.error(`[delete-social-group] ❌ DB DELETE ERROR:`, deleteError.message);
            throw deleteError;
        }

        console.log(`[delete-social-group] 🎉 SUCCESS: Group ${groupId} deleted.`);
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Group deleted successfully.' })
        };

    } catch (error: any) {
        console.error('[delete-social-group] 💣 UNEXPECTED ERROR:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                error: (error.message || 'Unknown server error')
            })
        };
    }
};
