#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://mkoryudscamnopvxdelk.supabase.co',
    '[REDACTED_ANON_KEY]'
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
