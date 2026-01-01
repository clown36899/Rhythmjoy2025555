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
    if (!fullUrl) return null;
    try {
        const url = new URL(fullUrl);
        const parts = url.pathname.split('/images/');
        if (parts.length > 1) return decodeURIComponent(parts[1]);
    } catch (e) { console.error('Error parsing URL:', fullUrl, e); }
    return null;
};

// Helper: Recursive/Iterative folder cleanup
const deleteFolderContents = async (storagePath: string) => {
    console.log(`[delete-social-item] 📦 Cleaning up folder: ${storagePath}`);
    // 1. Profile images
    const { data: profileFiles } = await supabaseAdmin.storage.from('images').list(`${storagePath}/profile`);
    if (profileFiles && profileFiles.length > 0) {
        const paths = profileFiles.map(f => `${storagePath}/profile/${f.name}`);
        await supabaseAdmin.storage.from('images').remove(paths);
        console.log(`[delete-social-item] 🗑️ Removed profile images:`, paths);
    }

    // 2. Schedule images
    const { data: scheduleFolders } = await supabaseAdmin.storage.from('images').list(`${storagePath}/schedules`);
    if (scheduleFolders) {
        for (const folder of scheduleFolders) {
            const scheduleBasePath = `${storagePath}/schedules/${folder.name}`;
            const { data: sFiles } = await supabaseAdmin.storage.from('images').list(scheduleBasePath);
            if (sFiles && sFiles.length > 0) {
                const sPaths = sFiles.map(f => `${scheduleBasePath}/${f.name}`);
                await supabaseAdmin.storage.from('images').remove(sPaths);
                console.log(`[delete-social-item] 🗑️ Removed schedule images in ${folder.name}`);
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
        }
    }
};

export const handler: Handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: '' };
    }

    try {
        const { type, id, password } = JSON.parse(event.body || '{}');
        console.log(`[delete-social-item] 🔥 Request: Type=${type}, ID=${id}`);

        if (!type || !id) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Type and ID are required.' })
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
            const { data: { user } } = await userSupabase.auth.getUser();
            if (user) {
                authUserId = user.id;
                userEmail = user.email;
                if (user.app_metadata?.is_admin === true || (adminEmailEnv && user.email === adminEmailEnv)) {
                    isAuthorized = true;
                    authReason = "Admin";
                }
            }
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
                return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Group not found.' }) };
            }

            // 2. Auth Check (Group)
            if (!isAuthorized) {
                if (authUserId && group.user_id === authUserId) {
                    isAuthorized = true;
                    authReason = "Owner";
                } else if (group.password && group.password === password) {
                    isAuthorized = true;
                    authReason = "Password";
                }
            }

            if (!isAuthorized) {
                return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized.' }) };
            }

            // 3. Delete Images (Folder cleanup)
            if (group.storage_path) {
                await deleteFolderContents(group.storage_path);
            }

            // 4. Delete DB Record
            const { error: delError } = await supabaseAdmin.from('social_groups').delete().eq('id', id);
            if (delError) throw delError;

        } else if (type === 'schedule') {
            // 1. Fetch Schedule
            const { data: schedule, error: fetchError } = await supabaseAdmin
                .from('social_schedules')
                .select('*')
                .eq('id', id)
                .single();

            if (fetchError || !schedule) {
                return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Schedule not found.' }) };
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
                            else if (group.password && group.password === password) {
                                isAuthorized = true;
                                authReason = "Group Password";
                            }
                        }
                    }
                }
            }

            if (!isAuthorized) {
                return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized.' }) };
            }

            // 3. Delete Images (Specific files)
            const filesToDelete = [
                schedule.image_full, schedule.image_medium,
                schedule.image_thumbnail, schedule.image_micro, schedule.image_url
            ].map(url => extractStoragePath(url)).filter(Boolean) as string[];

            const uniquePaths = [...new Set(filesToDelete)];
            if (uniquePaths.length > 0) {
                console.log(`[delete-social-item] 🗑️ Deleting ${uniquePaths.length} schedule images.`);
                await supabaseAdmin.storage.from('images').remove(uniquePaths);
            }

            // 4. Delete DB Record
            const { error: delError } = await supabaseAdmin.from('social_schedules').delete().eq('id', id);
            if (delError) throw delError;

        } else {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid type.' }) };
        }

        console.log(`[delete-social-item] 🎉 Success: ${type} ${id} deleted (${authReason}).`);
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
