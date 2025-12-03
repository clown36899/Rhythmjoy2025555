
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env vars (simple approach for script)
// Note: In a real env we might use dotenv, but here we'll try to read .env.local or just assume vars are needed.
// Since I can't easily read .env in this script without dotenv, I will ask the agent to provide them or read them from the file system.
// Actually, I can read .env.local manually.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function getEnvVar(name) {
    try {
        const envPath = path.join(projectRoot, '.env.local');
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf-8');
            const match = content.match(new RegExp(`^${name}=(.*)$`, 'm'));
            if (match) return match[1].trim();
        }

        const envPath2 = path.join(projectRoot, '.env');
        if (fs.existsSync(envPath2)) {
            const content = fs.readFileSync(envPath2, 'utf-8');
            const match = content.match(new RegExp(`^${name}=(.*)$`, 'm'));
            if (match) return match[1].trim();
        }
    } catch (e) {
        console.error('Error reading env file:', e);
    }
    return process.env[name];
}

const SUPABASE_URL = getEnvVar('VITE_SUPABASE_URL');
const SUPABASE_KEY = getEnvVar('VITE_SUPABASE_ANON_KEY');

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Error: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not found in .env or .env.local');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function uploadImage(filePath, bucketPath) {
    const fileContent = fs.readFileSync(filePath);
    const { data, error } = await supabase.storage
        .from('images')
        .upload(bucketPath, fileContent, {
            contentType: 'image/png',
            upsert: true
        });

    if (error) {
        throw new Error(`Upload failed for ${bucketPath}: ${error.message}`);
    }

    const { data: publicUrlData } = supabase.storage
        .from('images')
        .getPublicUrl(bucketPath);

    return publicUrlData.publicUrl;
}

async function main() {
    try {
        console.log('Starting default thumbnail update...');

        // Paths to the generated images (passed as args or hardcoded for this task)
        // I will hardcode the paths based on where I saved them.
        // Note: The agent saved them to artifacts dir. I need to copy them or read them from there.
        // The artifacts dir is /Users/inteyeo/.gemini/antigravity/brain/e8e23617-c9a3-44c1-9066-508ca8801cd9

        const artifactsDir = '/Users/inteyeo/.gemini/antigravity/brain/e8e23617-c9a3-44c1-9066-508ca8801cd9';
        // I need to find the exact filenames. I will assume the agent knows them or I can list them.
        // Actually, I know the filenames from the previous step output.
        // default_class_thumbnail_1764722338340.png
        // default_event_thumbnail_1764722354136.png

        // To make this script robust, I will accept paths as arguments.
        const classThumbPath = process.argv[2];
        const eventThumbPath = process.argv[3];

        if (!classThumbPath || !eventThumbPath) {
            console.error('Usage: node upload_default_thumbnails.js <class_thumb_path> <event_thumb_path>');
            process.exit(1);
        }

        console.log(`Uploading Class Thumbnail: ${classThumbPath}`);
        const classUrl = await uploadImage(classThumbPath, `default-thumbnails/default_class_optimized_${Date.now()}.png`);
        console.log(`Class Thumbnail Uploaded: ${classUrl}`);

        console.log(`Uploading Event Thumbnail: ${eventThumbPath}`);
        const eventUrl = await uploadImage(eventThumbPath, `default-thumbnails/default_event_optimized_${Date.now()}.png`);
        console.log(`Event Thumbnail Uploaded: ${eventUrl}`);

        console.log('Updating billboard_settings...');
        const { error } = await supabase
            .from('billboard_settings')
            .update({
                default_thumbnail_class: classUrl,
                default_thumbnail_event: eventUrl,
                updated_at: new Date().toISOString()
            })
            .eq('id', 1);

        if (error) throw error;

        console.log('Successfully updated billboard_settings!');

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

main();
