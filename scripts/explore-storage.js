#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://mkoryudscamnopvxdelk.supabase.co',
    '[REDACTED_SERVICE_ROLE_KEY]'
);

async function exploreFolder(path = '', depth = 0) {
    const indent = '  '.repeat(depth);

    const { data, error } = await supabase.storage
        .from('images')
        .list(path, { limit: 1000 });

    if (error) {
        console.error(`${indent}Error listing ${path}:`, error);
        return;
    }

    if (!data) return;

    // Separate folders and files
    const folders = data.filter(item => item.id === null);
    const files = data.filter(item => item.id !== null);

    if (files.length > 0) {
        console.log(`${indent}📄 ${path || 'root'}: ${files.length} files`);
    }

    // Recursively explore subfolders
    for (const folder of folders) {
        const subPath = path ? `${path}/${folder.name}` : folder.name;
        console.log(`${indent}📁 ${folder.name}/`);
        await exploreFolder(subPath, depth + 1);
    }
}

console.log('🗂️  Complete Storage Structure:\n');
await exploreFolder('', 0);
