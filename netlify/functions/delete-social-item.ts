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

// Helper: Extract storage path from URL
const extractStoragePath = (fullUrl: string | null): string | null => {
    if (!fullUrl) {
        return null;
    }
    try {
        console.error(`[delete-social-item] 🔍 Parsing URL for path check: ${fullUrl}`);
        const url = new URL(fullUrl);
        // Path parts: /storage/v1/object/public/images/...
        // We want everything after /images/
        const parts = url.pathname.split('/images/');
        if (parts.length > 1) {
            const path = decodeURIComponent(parts[1]);
            // console.error(`[delete-social-item] ✅ Extracted Path: ${path}`);
            return path;
        } else {
            console.error('[delete-social-item] ⚠️ URL structure differs from expectation (no /images/ split):', url.pathname);
        }
    } catch (e) { console.error('Error parsing URL:', fullUrl, e); }
    return null;
};

// Helper: Recursive/Iterative folder cleanup
const deleteFolderContents = async (storagePath: string) => {
    console.error(`[delete-social-item] 📦 Cleaning up folder: ${storagePath}`);

    // 1. Profile images
    const { data: profileFiles, error: pError } = await supabaseAdmin.storage.from('images').list(`${storagePath}/profile`);
    if (pError) console.error('[delete-social-item] Error listing profile:', pError);
    if (profileFiles && profileFiles.length > 0) {
        const paths = profileFiles.map(f => `${storagePath}/profile/${f.name}`);
        await supabaseAdmin.storage.from('images').remove(paths);
        console.error(`[delete-social-item] 🗑️ Removed profile images:`, paths);
    }

    // 2. Schedule images
    const { data: scheduleFolders, error: sError } = await supabaseAdmin.storage.from('images').list(`${storagePath}/schedules`);
    if (sError) console.error('[delete-social-item] Error listing schedules:', sError);

    if (scheduleFolders) {
        for (const folder of scheduleFolders) {
            const scheduleBasePath = `${storagePath}/schedules/${folder.name}`;
            const { data: sFiles } = await supabaseAdmin.storage.from('images').list(scheduleBasePath);
            if (sFiles && sFiles.length > 0) {
                const sPaths = sFiles.map(f => `${scheduleBasePath}/${f.name}`);
                await supabaseAdmin.storage.from('images').remove(sPaths);
                console.error(`[delete-social-item] 🗑️ Removed schedule images in ${folder.name}:`, sPaths);
            }
            // Try to remove the folder/file itself just in case it's a flat file
            if (folder.id) {
                await supabaseAdmin.storage.from('images').remove([scheduleBasePath]);
            }
        }
    }

    // 3. Loose files
    const { data: rootFiles } = await supabaseAdmin.storage.from('images').list(storagePath);
    if (rootFiles && rootFiles.length > 0) {
        const rootPaths = rootFiles.filter(f => !!f.id).map(f => `${storagePath}/${f.name}`);
        if (rootPaths.length > 0) {
            await supabaseAdmin.storage.from('images').remove(rootPaths);
            console.error(`[delete-social-item] 🗑️ Removed loose root files:`, rootPaths);
        }
    }
};

export const handler: Handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: '' };
    }

    try {
        const { type, id: rawId, password } = JSON.parse(event.body || '{}');

        // Convert ID to number (critical for DB comparison)
        const id = typeof rawId === 'string' ? parseInt(rawId, 10) : rawId;

        console.error(`[delete-social-item] 🔥 Request: Type=${type}, ID=${id} (raw: ${rawId}, type: ${typeof id})`);

        if (!type || !id || isNaN(id)) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Type and valid numeric ID are required.' })
            };
        }

        // --- AUTHENTICATION ---
        let isAuthorized = false;
        let authReason = "";
        let authUserId = null;
        let userEmail = null;

        const authHeader = event.headers.authorization;
        if (authHeader) {
            const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
                global: { headers: { Authorization: authHeader } },
                auth: { persistSession: false }
            });
            const { data: { user }, error: userError } = await userSupabase.auth.getUser();
            if (userError) {
                console.error('[delete-social-item] User auth error:', userError);
            }
            if (user) {
                authUserId = user.id;
                userEmail = user.email;
                if (user.app_metadata?.is_admin === true || (adminEmailEnv && user.email === adminEmailEnv)) {
                    isAuthorized = true;
                    authReason = "Admin";
                }
            }
        } else {
            console.error('[delete-social-item] No Auth header provided.');
        }

        // --- LOGIC PER TYPE ---

        if (type === 'group') {
            // 1. Fetch Group
            const { data: group, error: fetchError } = await supabaseAdmin
                .from('social_groups')
                .select('*')
                .eq('id', id)
                .single();

            if (fetchError || !group) {
                console.error(`[delete-social-item] Group ${id} not found.`);
                return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Group not found or already deleted.' }) };
            }

            // 2. Auth Check (Group)
            if (!isAuthorized) {
                if (authUserId && group.user_id === authUserId) {
                    isAuthorized = true;
                    authReason = "Owner";
                } else if (group.password && password && group.password === password) {
                    isAuthorized = true;
                    authReason = "Password";
                } else {
                    console.error(`[delete-social-item] Group Auth Failed. User: ${authUserId}, Owner: ${group.user_id}`);
                }
            }

            if (!isAuthorized) {
                return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized.' }) };
            }

            console.error(`[delete-social-item] 🚀 Authorized (${authReason}). Deleting Group...`);

            // 3. Delete Images (Folder cleanup)
            if (group.storage_path) {
                await deleteFolderContents(group.storage_path);
            } else {
                console.error('[delete-social-item] No storage_path for group. Skipping folder cleanup.');
            }

            // 4. Delete DB Record
            const { error: delError } = await supabaseAdmin.from('social_groups').delete().eq('id', id);
            if (delError) {
                console.error('[delete-social-item] DB Delete Error:', delError);
                throw delError;
            }

        } else if (type === 'schedule') {
            // 1. Fetch Schedule
            const { data: schedule, error: fetchError } = await supabaseAdmin
                .from('social_schedules')
                .select('*')
                .eq('id', id)
                .single();

            if (fetchError || !schedule) {
                console.error(`[delete-social-item] Schedule ${id} not found.`);
                return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Schedule not found or already deleted.' }) };
            }

            // 2. Auth Check (Schedule)
            if (!isAuthorized) {
                // Schedule Owner
                if (authUserId && schedule.user_id === authUserId) {
                    isAuthorized = true;
                    authReason = "Schedule Owner";
                } else {
                    // Group Owner Check
                    if (schedule.group_id) {
                        const { data: group } = await supabaseAdmin.from('social_groups').select('user_id, password').eq('id', schedule.group_id).single();
                        if (group) {
                            if (authUserId && group.user_id === authUserId) {
                                isAuthorized = true;
                                authReason = "Group Owner";
                            }
                            // Password Check (using Group Password for schedule deletion)
                            else if (group.password && password && group.password === password) {
                                isAuthorized = true;
                                authReason = "Group Password";
                            }
                        }
                    }
                }
            }

            if (!isAuthorized) {
                console.error(`[delete-social-item] Schedule Auth Failed. User: ${authUserId}, ScheduleOwner: ${schedule.user_id}`);
                return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized.' }) };
            }

            console.error(`[delete-social-item] 🚀 Authorized (${authReason}). Deleting Schedule...`);

            // 3. Delete Images (Specific files)
            const filesToDelete = [
                schedule.image_full, schedule.image_medium,
                schedule.image_thumbnail, schedule.image_micro, schedule.image_url
            ].map(url => extractStoragePath(url)).filter(Boolean) as string[];

            const uniquePaths = [...new Set(filesToDelete)];
            if (uniquePaths.length > 0) {
                console.error(`[delete-social-item] 🗑️ Deleting ${uniquePaths.length} schedule images from list:`, uniquePaths);
                const { error: remImgErr } = await supabaseAdmin.storage.from('images').remove(uniquePaths);
                if (remImgErr) console.error('[delete-social-item] Image delete error:', remImgErr);
            } else {
                console.error('[delete-social-item] ℹ️ No images found to delete for this schedule.');
            }

            // 4. Delete DB Record
            const { error: delError } = await supabaseAdmin.from('social_schedules').delete().eq('id', id);
            if (delError) {
                console.error('[delete-social-item] DB Delete Error:', delError);
                throw delError;
            }

        } else {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid type.' }) };
        }

        console.error(`[delete-social-item] 🎉 Success: ${type} ${id} deleted.`);
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Deleted successfully.' })
        };

    } catch (error: any) {
        console.error('[delete-social-item] 💣 Error:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: error.message })
        };
    }
};
