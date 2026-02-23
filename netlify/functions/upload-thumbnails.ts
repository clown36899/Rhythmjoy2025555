import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// CJS Environment assumed (Netlify Functions default)
// import.meta.url removed to prevent bundling warning/error

export const handler: Handler = async (event, context) => {
    const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Missing Supabase credentials' })
        };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    // When bundled, __dirname points to the function location.
    // We need to ensure public/default-thumbnails is included and findable.
    // Usually, included_files puts them relative to the function or root.
    // Let's try standard relative path from the function file.
    const thumbnailsDir = path.resolve('./public/default-thumbnails');
    console.log(`[upload-thumbnails] Searching for thumbnails in: ${thumbnailsDir}`);


    try {
        const files = fs.readdirSync(thumbnailsDir);
        const results = [];

        for (const file of files) {
            if (file.endsWith('.webp')) {
                const filePath = path.join(thumbnailsDir, file);
                const fileBuffer = fs.readFileSync(filePath);
                const storagePath = `default-thumbnails/${file}`;

                const { error } = await supabase.storage
                    .from('images')
                    .upload(storagePath, fileBuffer, {
                        contentType: 'image/webp',
                        upsert: true
                    });

                if (error) {
                    results.push({ file, status: 'error', error: error.message });
                } else {
                    const { data: urlData } = supabase.storage
                        .from('images')
                        .getPublicUrl(storagePath);

                    results.push({ file, status: 'success', url: urlData.publicUrl });
                }
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Upload complete', results })
        };
    } catch (error: any) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message || 'Unknown error' })
        };
    }
};
