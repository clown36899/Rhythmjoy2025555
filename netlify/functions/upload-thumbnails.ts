import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    const thumbnailsDir = path.join(__dirname, '../../public/default-thumbnails');

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
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
