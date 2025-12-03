#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://mkoryudscamnopvxdelk.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE'
);

const filename = '1000016645_1763058488809_medium.webp';

console.log(`🔍 Searching for ${filename} in all storage folders...\n`);

const folders = ['', 'practice-rooms', 'social-event-images', 'default-thumbnails', 'event-posters'];

let foundInStorage = false;

for (const folder of folders) {
    const { data, error } = await supabase.storage
        .from('images')
        .list(folder, { limit: 1000 });

    if (error) {
        console.error(`Error listing ${folder}:`, error);
        continue;
    }

    if (data) {
        const found = data.find(file => file.name === filename);
        if (found) {
            console.log(`✅ FOUND in storage folder: ${folder || 'root'}`);
            console.log(`   File: ${found.name}`);
            console.log(`   Size: ${(found.metadata?.size / 1024).toFixed(2)} KB`);
            console.log(`   Created: ${found.created_at}`);
            console.log(`   Full path: ${folder ? folder + '/' : ''}${found.name}\n`);
            foundInStorage = true;

            // Check if it's referenced in database
            console.log('🔍 Checking database references...\n');

            // Check events table
            const { data: events } = await supabase
                .from('events')
                .select('id, title, image, image_thumbnail, image_medium, image_full');

            let referenced = false;
            events?.forEach(event => {
                if (event.image?.includes(filename)) {
                    console.log(`   ✅ Referenced in events.image:`);
                    console.log(`      Event: ${event.title} (ID: ${event.id})`);
                    referenced = true;
                }
                if (event.image_thumbnail?.includes(filename)) {
                    console.log(`   ✅ Referenced in events.image_thumbnail:`);
                    console.log(`      Event: ${event.title} (ID: ${event.id})`);
                    referenced = true;
                }
                if (event.image_medium?.includes(filename)) {
                    console.log(`   ✅ Referenced in events.image_medium:`);
                    console.log(`      Event: ${event.title} (ID: ${event.id})`);
                    referenced = true;
                }
                if (event.image_full?.includes(filename)) {
                    console.log(`   ✅ Referenced in events.image_full:`);
                    console.log(`      Event: ${event.title} (ID: ${event.id})`);
                    referenced = true;
                }
            });

            // Check practice_rooms
            const { data: rooms } = await supabase
                .from('practice_rooms')
                .select('id, name, image, images');

            rooms?.forEach(room => {
                if (room.image?.includes(filename)) {
                    console.log(`   ✅ Referenced in practice_rooms.image:`);
                    console.log(`      Room: ${room.name} (ID: ${room.id})`);
                    referenced = true;
                }

                let imageArray = room.images;
                if (typeof imageArray === 'string') {
                    try { imageArray = JSON.parse(imageArray); } catch (e) { }
                }

                if (Array.isArray(imageArray)) {
                    imageArray.forEach((url, idx) => {
                        if (url?.includes(filename)) {
                            console.log(`   ✅ Referenced in practice_rooms.images[${idx}]:`);
                            console.log(`      Room: ${room.name} (ID: ${room.id})`);
                            referenced = true;
                        }
                    });
                }
            });

            // Check social_events
            const { data: socialEvents } = await supabase
                .from('social_events')
                .select('id, title, image_url');

            socialEvents?.forEach(event => {
                if (event.image_url?.includes(filename)) {
                    console.log(`   ✅ Referenced in social_events.image_url:`);
                    console.log(`      Event: ${event.title} (ID: ${event.id})`);
                    referenced = true;
                }
            });

            if (!referenced) {
                console.log(`   ❌ NOT referenced in any database table - this is an ORPHANED file!\n`);
                console.log(`   💡 This file should be deleted.`);
            }
        }
    }
}

if (!foundInStorage) {
    console.log('❌ File NOT found in storage');
}

console.log('\n✅ Search complete');
