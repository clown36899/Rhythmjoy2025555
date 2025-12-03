#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://mkoryudscamnopvxdelk.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0ODA0ODIsImV4cCI6MjA3NTA1NjQ4Mn0.EgapnMjdLh9Wb7pWA4OKyaOZ0GpmJLZ_KHKcBaqc160'
);

const filename = '1759500709869.png';

console.log(`🔍 Checking if ${filename} is referenced in database...\n`);

// Check practice_rooms
const { data: rooms } = await supabase
    .from('practice_rooms')
    .select('id, name, image, images');

let found = false;

rooms?.forEach(room => {
    if (room.image?.includes(filename)) {
        console.log('✅ Found in practice_rooms.image:');
        console.log(`   Room ID: ${room.id}`);
        console.log(`   Room Name: ${room.name}`);
        console.log(`   Image URL: ${room.image}`);
        found = true;
    }

    let imageArray = room.images;
    if (typeof imageArray === 'string') {
        try { imageArray = JSON.parse(imageArray); } catch (e) { }
    }

    if (Array.isArray(imageArray)) {
        imageArray.forEach((url, idx) => {
            if (url?.includes(filename)) {
                console.log('✅ Found in practice_rooms.images array:');
                console.log(`   Room ID: ${room.id}`);
                console.log(`   Room Name: ${room.name}`);
                console.log(`   Image Index: ${idx}`);
                console.log(`   Image URL: ${url}`);
                found = true;
            }
        });
    }
});

if (!found) {
    console.log('❌ File NOT referenced in database - should be deleted as orphaned');
} else {
    console.log('\n✅ File IS being used - should NOT be deleted');
}
