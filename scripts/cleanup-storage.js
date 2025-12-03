#!/usr/bin/env node

/**
 * Supabase Storage Cleanup Utility
 * 
 * This script helps identify and clean up unused images in Supabase storage.
 * 
 * Usage:
 *   node scripts/cleanup-storage.js --analyze    # Generate storage report
 *   node scripts/cleanup-storage.js --dry-run    # Show what would be deleted
 *   node scripts/cleanup-storage.js --cleanup    # Actually delete unused files
 */

import { createClient } from '@supabase/supabase-js';
import * as readline from 'readline';

const SUPABASE_URL = 'https://mkoryudscamnopvxdelk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0ODA0ODIsImV4cCI6MjA3NTA1NjQ4Mn0.EgapnMjdLh9Wb7pWA4OKyaOZ0GpmJLZ_KHKcBaqc160';

// For deletion operations, we need the service role key
// Get it from: Supabase Dashboard > Project Settings > API > service_role key
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required for cleanup operations.');
    console.error('   Get your service role key from: Supabase Dashboard > Project Settings > API');
    console.error('   Then run: SUPABASE_SERVICE_ROLE_KEY=your_key_here node scripts/cleanup-storage.js --cleanup');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Helper to prompt user for confirmation
function prompt(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

// Extract storage path from Supabase URL
function extractStoragePath(url) {
    if (!url) return null;
    try {
        const match = url.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+?)(\?|$)/);
        return match ? decodeURIComponent(match[1]) : null;
    } catch (e) {
        return null;
    }
}

// Recursively scan a folder and all its subfolders
async function scanFolder(path = '') {
    const files = [];

    const { data, error } = await supabase.storage
        .from('images')
        .list(path, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });

    if (error) {
        console.error(`Error listing ${path}:`, error);
        return files;
    }

    if (!data) return files;

    // Separate folders and files
    const folders = data.filter(item => item.id === null);
    const actualFiles = data.filter(item => item.id !== null);

    // Add actual files to the list
    actualFiles.forEach(file => {
        const filePath = path ? `${path}/${file.name}` : file.name;
        const hasExtension = filePath.includes('.');
        const size = file.metadata?.size || 0;

        // Skip if it looks like a folder (no extension and zero size)
        if (!hasExtension && size === 0) {
            return;
        }

        files.push({
            path: filePath,
            size,
            created: file.created_at
        });
    });

    // Recursively scan subfolders
    for (const folder of folders) {
        const subPath = path ? `${path}/${folder.name}` : folder.name;
        const subFiles = await scanFolder(subPath);
        files.push(...subFiles);
    }

    return files;
}

// Get all files from Supabase storage (recursively)
async function getAllStorageFiles() {
    console.log('📦 Fetching all files from Supabase storage (including subfolders)...');

    const allFiles = await scanFolder('');

    console.log(`✅ Found ${allFiles.length} files in storage`);
    return allFiles;
}

// Get all image references from database
async function getReferencedImages() {
    console.log('🔍 Scanning database for image references...');

    const referenced = new Set();

    // Events table
    const { data: events } = await supabase
        .from('events')
        .select('image, image_thumbnail, image_medium, image_full');

    events?.forEach(event => {
        [event.image, event.image_thumbnail, event.image_medium, event.image_full].forEach(url => {
            const path = extractStoragePath(url);
            if (path) referenced.add(path);
        });
    });

    // Practice rooms table
    const { data: rooms } = await supabase
        .from('practice_rooms')
        .select('image, images');

    rooms?.forEach(room => {
        const path = extractStoragePath(room.image);
        if (path) referenced.add(path);

        let imageArray = room.images;
        if (typeof imageArray === 'string') {
            try {
                imageArray = JSON.parse(imageArray);
            } catch (e) { }
        }

        if (Array.isArray(imageArray)) {
            imageArray.forEach(url => {
                const path = extractStoragePath(url);
                if (path) referenced.add(path);
            });
        }
    });

    // Social events table
    const { data: socialEvents } = await supabase
        .from('social_events')
        .select('image_url');

    socialEvents?.forEach(event => {
        const path = extractStoragePath(event.image_url);
        if (path) referenced.add(path);
    });

    // Billboard settings
    const { data: settings } = await supabase
        .from('billboard_settings')
        .select('default_thumbnail_class, default_thumbnail_event');

    settings?.forEach(setting => {
        [setting.default_thumbnail_class, setting.default_thumbnail_event].forEach(url => {
            const path = extractStoragePath(url);
            if (path) referenced.add(path);
        });
    });

    console.log(`✅ Found ${referenced.size} referenced images in database`);
    return referenced;
}

// Analyze storage usage
async function analyzeStorage() {
    const files = await getAllStorageFiles();
    const referenced = await getReferencedImages();

    const orphaned = files.filter(file => !referenced.has(file.path));
    const used = files.filter(file => referenced.has(file.path));

    // Calculate sizes
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    const orphanedSize = orphaned.reduce((sum, f) => sum + f.size, 0);
    const usedSize = used.reduce((sum, f) => sum + f.size, 0);

    // Group by folder
    const byFolder = {};
    files.forEach(file => {
        const folder = file.path.includes('/') ? file.path.split('/')[0] : 'root';
        if (!byFolder[folder]) {
            byFolder[folder] = { count: 0, size: 0, orphaned: 0, orphanedSize: 0 };
        }
        byFolder[folder].count++;
        byFolder[folder].size += file.size;

        if (!referenced.has(file.path)) {
            byFolder[folder].orphaned++;
            byFolder[folder].orphanedSize += file.size;
        }
    });

    console.log('\n' + '='.repeat(80));
    console.log('📊 STORAGE ANALYSIS REPORT');
    console.log('='.repeat(80));
    console.log(`\nTotal Files: ${files.length}`);
    console.log(`Total Size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`\nUsed Files: ${used.length} (${(usedSize / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`Orphaned Files: ${orphaned.length} (${(orphanedSize / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`\nPotential Savings: ${(orphanedSize / 1024 / 1024).toFixed(2)} MB (${((orphanedSize / totalSize) * 100).toFixed(1)}%)`);

    console.log('\n' + '-'.repeat(80));
    console.log('By Folder:');
    console.log('-'.repeat(80));
    Object.entries(byFolder).forEach(([folder, stats]) => {
        console.log(`\n${folder}:`);
        console.log(`  Total: ${stats.count} files (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
        console.log(`  Orphaned: ${stats.orphaned} files (${(stats.orphanedSize / 1024 / 1024).toFixed(2)} MB)`);
    });

    if (orphaned.length > 0) {
        console.log('\n' + '-'.repeat(80));
        console.log('Orphaned Files (first 20):');
        console.log('-'.repeat(80));
        orphaned.slice(0, 20).forEach(file => {
            console.log(`  ${file.path} (${(file.size / 1024).toFixed(1)} KB)`);
        });
        if (orphaned.length > 20) {
            console.log(`  ... and ${orphaned.length - 20} more`);
        }
    }

    console.log('\n' + '='.repeat(80));

    return { files, referenced, orphaned, used };
}

// Delete orphaned files
async function cleanupOrphaned(orphaned, dryRun = true) {
    if (orphaned.length === 0) {
        console.log('\n✅ No orphaned files to delete!');
        return;
    }

    console.log(`\n${dryRun ? '🔍 DRY RUN:' : '🗑️  DELETING:'} ${orphaned.length} orphaned files...`);

    if (!dryRun) {
        const answer = await prompt(`\n⚠️  Are you sure you want to delete ${orphaned.length} files? (yes/no): `);
        if (answer.toLowerCase() !== 'yes') {
            console.log('❌ Cleanup cancelled');
            return;
        }
    }

    const paths = orphaned.map(f => f.path);

    if (dryRun) {
        console.log('\nWould delete:');
        paths.slice(0, 20).forEach(path => console.log(`  - ${path}`));
        if (paths.length > 20) {
            console.log(`  ... and ${paths.length - 20} more`);
        }
    } else {
        // Delete in batches of 50
        const batchSize = 50;
        let deleted = 0;

        for (let i = 0; i < paths.length; i += batchSize) {
            const batch = paths.slice(i, i + batchSize);
            const { error } = await supabase.storage.from('images').remove(batch);

            if (error) {
                console.error(`Error deleting batch ${i / batchSize + 1}:`, error);
            } else {
                deleted += batch.length;
                console.log(`  Deleted ${deleted}/${paths.length} files...`);
            }
        }

        console.log(`\n✅ Deleted ${deleted} orphaned files`);

        // Save list of deleted files
        const fs = await import('fs');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const logFile = `deleted-files-${timestamp}.txt`;
        fs.writeFileSync(logFile, paths.join('\n'));
        console.log(`📝 Saved list of deleted files to: ${logFile}`);
    }
}

// Main function
async function main() {
    const args = process.argv.slice(2);
    const mode = args[0] || '--analyze';

    console.log('🚀 Supabase Storage Cleanup Utility\n');

    const { orphaned } = await analyzeStorage();

    if (mode === '--dry-run') {
        await cleanupOrphaned(orphaned, true);
    } else if (mode === '--cleanup') {
        await cleanupOrphaned(orphaned, false);
    } else {
        console.log('\n💡 Next steps:');
        console.log('  node scripts/cleanup-storage.js --dry-run    # Preview deletion');
        console.log('  node scripts/cleanup-storage.js --cleanup    # Actually delete');
    }
}

main().catch(console.error);
