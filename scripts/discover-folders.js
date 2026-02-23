#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://mkoryudscamnopvxdelk.supabase.co',
    '[REDACTED_SERVICE_ROLE_KEY]'
);

console.log('🔍 Discovering ALL folders in storage...\n');

// First, list root to find all folders
const { data: rootFiles, error: rootError } = await supabase.storage
    .from('images')
    .list('', { limit: 1000 });

if (rootError) {
    console.error('Error listing root:', rootError);
} else {
    console.log('📁 Folders found in root:');
    const folders = rootFiles
        .filter(item => item.id === null) // Folders have null id
        .map(item => item.name);

    folders.forEach(folder => {
        console.log(`   - ${folder}`);
    });

    console.log(`\n📊 Total folders: ${folders.length}\n`);

    // Now search for the specific file in all folders including root
    const filename = '1000016645_1763058488809_medium.webp';
    console.log(`🔍 Searching for: ${filename}\n`);

    const allFolders = ['', ...folders];

    for (const folder of allFolders) {
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
                console.log(`✅ FOUND!`);
                console.log(`   Folder: ${folder || 'root'}`);
                console.log(`   File: ${found.name}`);
                console.log(`   Size: ${(found.metadata?.size / 1024).toFixed(2)} KB`);
                console.log(`   Full path: ${folder ? folder + '/' : ''}${found.name}`);
                break;
            }
        }
    }
}

console.log('\n✅ Search complete');
