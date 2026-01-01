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

// Helper: Recursive/Iterative folder cleanup - Wipes EVERYTHING under a path
const wipeStorageFolder = async (storagePath: string) => {
    console.error(`[delete-social-item] 🌪️ STARTING NUCLEAR FOLDER WIPE: ${storagePath}`);

    try {
        // 1. Get all files in the root of the storage path
        const { data: rootItems, error: rootError } = await supabaseAdmin.storage.from('images').list(storagePath);
        if (rootError) {
            console.error(`[delete-social-item] ❌ Error listing root path ${storagePath}:`, rootError);
            return;
        }

        const allFilePaths: string[] = [];

        if (rootItems) {
            for (const item of rootItems) {
                const itemPath = `${storagePath}/${item.name}`;
                if (item.id) {
                    // It's a file
                    allFilePaths.push(itemPath);
                } else {
                    // It's a folder (like 'profile' or 'schedules')
                    console.error(`[delete-social-item] 📁 Found sub-folder: ${itemPath}. Listing...`);
                    const { data: subItems } = await supabaseAdmin.storage.from('images').list(itemPath);
                    if (subItems) {
                        for (const subItem of subItems) {
                            const subItemPath = `${itemPath}/${subItem.name}`;
                            if (subItem.id) {
                                allFilePaths.push(subItemPath);
                            } else {
                                // It's another level (like schedules/id)
                                console.error(`[delete-social-item] 📁 Found nested sub-folder: ${subItemPath}. Listing...`);
                                const { data: nestedItems } = await supabaseAdmin.storage.from('images').list(subItemPath);
                                if (nestedItems) {
                                    for (const nestedItem of nestedItems) {
                                        allFilePaths.push(`${subItemPath}/${nestedItem.name}`);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if (allFilePaths.length > 0) {
            console.error(`[delete-social-item] 🗑️ Wiping ${allFilePaths.length} files found in hierarchy:`, allFilePaths);
            const { error: removeError } = await supabaseAdmin.storage.from('images').remove(allFilePaths);
            if (removeError) {
                console.error('[delete-social-item] ❌ Bulk remove error:', removeError);
            } else {
                console.error('[delete-social-item] ✅ Hierarchy wipe successful.');
            }
        } else {
            console.error('[delete-social-item] ℹ️ Wipe completed: No files found to delete.');
        }
    } catch (e) {
        console.error('[delete-social-item] 💥 Fatal error during wipe:', e);
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

            // 3. Delete Images (Wipe the whole root folder)
            if (group.storage_path) {
                await wipeStorageFolder(group.storage_path);
            } else {
                console.error('[delete-social-item] ⚠️ No storage_path for group. Skipping folder wipe.');
            }

            // 4. Delete DB Records Hierarchy
            console.error(`[delete-social-item] 🗑️ Deleting all associated schedules for group ID: ${id}`);
            const { error: schedulesError } = await supabaseAdmin.from('social_schedules').delete().eq('group_id', id);
            if (schedulesError) {
                console.error('[delete-social-item] ❌ Schedules Delete Error:', schedulesError);
                // We proceed anyway to try and delete the group
            } else {
                console.error('[delete-social-item] ✅ All associated schedules deleted from DB.');
            }

            console.error(`[delete-social-item] 🗑️ Deleting DB record for group ID: ${id}`);
            const { error: delError } = await supabaseAdmin.from('social_groups').delete().eq('id', id);
            if (delError) {
                console.error('[delete-social-item] ❌ Group DB Delete Error:', delError);
                throw delError;
            } else {
                console.error('[delete-social-item] ✅ Group record deleted from DB.');
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

            // 3. Delete Images (Folder wipe if folder detected, else individual files)
            const filesToDelete = [
                schedule.image_full, schedule.image_medium,
                schedule.image_thumbnail, schedule.image_micro, schedule.image_url
            ].map(url => extractStoragePath(url)).filter(Boolean) as string[];

            const uniquePaths = [...new Set(filesToDelete)];
            if (uniquePaths.length > 0) {
                // Infer the folder path from the first file
                // If path is 'social-groups/X/schedules/Y/full.webp', folder is 'social-groups/X/schedules/Y'
                const firstPath = uniquePaths[0];
                const parts = firstPath.split('/');
                if (parts.length > 1) {
                    const folderPath = parts.slice(0, -1).join('/');
                    console.error(`[delete-social-item] 📁 Inferred schedule folder: ${folderPath}`);
                    await wipeStorageFolder(folderPath);
                } else {
                    console.error(`[delete-social-item] 🗑️ Deleting ${uniquePaths.length} schedule images from list:`, uniquePaths);
                    const { error: remImgErr } = await supabaseAdmin.storage.from('images').remove(uniquePaths);
                    if (remImgErr) {
                        console.error('[delete-social-item] ❌ Image delete error:', remImgErr);
                    } else {
                        console.error('[delete-social-item] ✅ Images deleted successfully.');
                    }
                }
            } else {
                console.error('[delete-social-item] ℹ️ No images found to delete for this schedule.');
            }

            // 4. Delete DB Record
            console.error(`[delete-social-item] 🗑️ Deleting DB record for schedule ID: ${id}`);
            const { error: delError } = await supabaseAdmin.from('social_schedules').delete().eq('id', id);
            if (delError) {
                console.error('[delete-social-item] ❌ DB Delete Error:', delError);
                throw delError;
            } else {
                console.error('[delete-social-item] ✅ DB record deleted.');
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
