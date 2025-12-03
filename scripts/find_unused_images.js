
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const DELETE_MODE = process.argv.includes('--delete');

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function getAllDatabaseImages() {
    const images = new Set();

    // Helper to add images to set
    const add = (url) => {
        if (!url) return;
        try {
            // Extract path from URL
            // URL format: https://.../storage/v1/object/public/images/folder/file.ext
            // We want: folder/file.ext
            const match = url.match(/\/storage\/v1\/object\/public\/images\/(.+?)(\?|$)/);
            if (match) {
                images.add(decodeURIComponent(match[1]));
            }
        } catch (e) {
            // ignore invalid urls
        }
    };

    console.log('Scanning database...');

    // 1. Events
    const { data: events } = await supabase
        .from('events')
        .select('image, image_thumbnail, image_medium, image_full');

    events?.forEach(e => {
        add(e.image);
        add(e.image_thumbnail);
        add(e.image_medium);
        add(e.image_full);
    });
    console.log(`- Scanned ${events?.length || 0} events`);

    // 2. Social Events
    const { data: socialEvents } = await supabase
        .from('social_events')
        .select('image_url');

    socialEvents?.forEach(e => {
        add(e.image_url);
    });
    console.log(`- Scanned ${socialEvents?.length || 0} social events`);

    // 3. Billboard Settings
    const { data: billboardSettings } = await supabase
        .from('billboard_settings')
        .select('default_thumbnail_class, default_thumbnail_event');

    billboardSettings?.forEach(e => {
        add(e.default_thumbnail_class);
        add(e.default_thumbnail_event);
    });
    console.log(`- Scanned billboard settings`);

    // 4. Shops
    const { data: shops } = await supabase
        .from('shops')
        .select('logo_url');

    shops?.forEach(e => {
        add(e.logo_url);
    });
    console.log(`- Scanned ${shops?.length || 0} shops`);

    // 5. Featured Items
    const { data: items } = await supabase
        .from('featured_items')
        .select('item_image_url');

    items?.forEach(e => {
        add(e.item_image_url);
    });
    console.log(`- Scanned ${items?.length || 0} featured items`);

    return images;
}

async function getAllStorageFiles() {
    console.log('Scanning storage bucket "images"...');
    let allFiles = [];

    // Recursive function to list all files
    async function listFiles(path = '') {
        const { data, error } = await supabase.storage.from('images').list(path, { limit: 1000 });
        if (error) throw error;

        for (const item of data) {
            if (item.id === null) {
                // It's a folder
                await listFiles(path ? `${path}/${item.name}` : item.name);
            } else {
                // It's a file
                allFiles.push({
                    name: path ? `${path}/${item.name}` : item.name,
                    size: item.metadata?.size || 0,
                    created_at: item.created_at
                });
            }
        }
    }

    await listFiles();
    console.log(`- Found ${allFiles.length} files in storage`);
    return allFiles;
}

async function main() {
    try {
        const dbImages = await getAllDatabaseImages();
        const storageFiles = await getAllStorageFiles();

        console.log(`\nAnalysis Results:`);
        console.log(`- Total files in DB: ${dbImages.size}`);
        console.log(`- Total files in Storage: ${storageFiles.length}`);

        const unusedFiles = storageFiles.filter(file => !dbImages.has(file.name));
        const totalSize = unusedFiles.reduce((acc, file) => acc + file.size, 0);
        const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);

        console.log(`\nFound ${unusedFiles.length} unused files (${totalSizeMB} MB)`);

        if (unusedFiles.length > 0) {
            console.log('\nTop 10 Unused Files (by size):');
            unusedFiles
                .sort((a, b) => b.size - a.size)
                .slice(0, 10)
                .forEach(f => console.log(`- ${f.name} (${(f.size / 1024).toFixed(1)} KB)`));

            if (DELETE_MODE) {
                console.log(`\nDeleting ${unusedFiles.length} files...`);

                // Delete in chunks of 50
                const chunkSize = 50;
                for (let i = 0; i < unusedFiles.length; i += chunkSize) {
                    const chunk = unusedFiles.slice(i, i + chunkSize).map(f => f.name);
                    const { error } = await supabase.storage.from('images').remove(chunk);
                    if (error) console.error(`Error deleting chunk ${i}:`, error);
                    else console.log(`Deleted ${chunk.length} files...`);
                }
                console.log('Deletion complete.');
            } else {
                console.log('\nTo delete these files, run this script with --delete flag.');
            }
        } else {
            console.log('No unused files found.');
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

main();
