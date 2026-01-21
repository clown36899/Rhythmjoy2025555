import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supabase 설정 (환경 변수에서 가져오기)
const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: VITE_PUBLIC_SUPABASE_URL and VITE_PUBLIC_SUPABASE_ANON_KEY must be set');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const thumbnailsDir = path.join(__dirname, 'public/default-thumbnails');

async function uploadFile(filePath, storagePath) {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    const { data, error } = await supabase.storage
        .from('images')
        .upload(storagePath, fileBuffer, {
            contentType: 'image/webp',
            upsert: true
        });

    if (error) {
        console.error(`Error uploading ${fileName}:`, error);
        return null;
    }

    const { data: urlData } = supabase.storage
        .from('images')
        .getPublicUrl(storagePath);

    console.log(`✓ Uploaded ${fileName}`);
    console.log(`  URL: ${urlData.publicUrl}`);
    return urlData.publicUrl;
}

async function main() {
    try {
        console.log('Uploading default thumbnails to Supabase storage...\n');

        const files = fs.readdirSync(thumbnailsDir);

        for (const file of files) {
            if (file.endsWith('.webp')) {
                const filePath = path.join(thumbnailsDir, file);
                const storagePath = `default-thumbnails/${file}`;
                await uploadFile(filePath, storagePath);
            }
        }

        console.log('\n✅ All thumbnails uploaded successfully!');
        console.log('\n파일 사용법:');
        console.log('- micro (100px): default_event_micro.webp, default_class_micro.webp');
        console.log('- thumbnail (400px): default_event_thumbnail.webp, default_class_thumbnail.webp');
        console.log('- medium (1080px): default_event_medium.webp, default_class_medium.webp');
        console.log('\n코드에서 필요한 크기를 선택해서 사용하세요.');
    } catch (error) {
        console.error('Error:', error);
    }
}

main();
