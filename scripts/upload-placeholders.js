#!/usr/bin/env node

/**
 * Upload Optimized Practice Room Images
 * 
 * This script uploads the generated placeholder images to Supabase storage
 * after optimizing them to WebP format.
 * 
 * Usage:
 *   node scripts/upload-placeholders.js
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = 'https://mkoryudscamnopvxdelk.supabase.co';
const SUPABASE_ANON_KEY = '[REDACTED_ANON_KEY]';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Paths to generated images
const ARTIFACT_DIR = path.join(__dirname, '../.gemini/antigravity/brain/93cdae7f-5eeb-4c97-8dde-a461551d8540');

async function convertToWebP(inputPath, outputPath) {
    console.log(`Converting ${path.basename(inputPath)} to WebP...`);

    // Note: This requires sharp library. Install with: npm install sharp
    try {
        const sharp = (await import('sharp')).default;

        await sharp(inputPath)
            .resize(800, 600, { fit: 'cover' })
            .webp({ quality: 85 })
            .toFile(outputPath);

        const stats = fs.statSync(outputPath);
        console.log(`  ✓ Converted: ${(stats.size / 1024).toFixed(1)} KB`);
        return true;
    } catch (error) {
        console.error(`  ✗ Error: ${error.message}`);
        console.log('  ℹ️  Install sharp: npm install sharp');
        return false;
    }
}

async function uploadToSupabase(filePath, storagePath) {
    console.log(`Uploading ${storagePath}...`);

    const fileBuffer = fs.readFileSync(filePath);

    const { data, error } = await supabase.storage
        .from('images')
        .upload(storagePath, fileBuffer, {
            contentType: 'image/webp',
            cacheControl: '31536000',
            upsert: true
        });

    if (error) {
        console.error(`  ✗ Upload failed: ${error.message}`);
        return null;
    }

    const { data: urlData } = supabase.storage
        .from('images')
        .getPublicUrl(storagePath);

    console.log(`  ✓ Uploaded: ${urlData.publicUrl}`);
    return urlData.publicUrl;
}

async function main() {
    console.log('🚀 Upload Optimized Practice Room Images\n');

    // Find generated images
    const imageFiles = fs.readdirSync(ARTIFACT_DIR)
        .filter(f => f.startsWith('practice_room_') && f.endsWith('.png'))
        .sort();

    if (imageFiles.length === 0) {
        console.log('❌ No generated images found!');
        console.log(`   Looking in: ${ARTIFACT_DIR}`);
        return;
    }

    console.log(`Found ${imageFiles.length} generated images:\n`);
    imageFiles.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    console.log();

    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    const uploadedUrls = [];

    for (let i = 0; i < imageFiles.length; i++) {
        const imageFile = imageFiles[i];
        const inputPath = path.join(ARTIFACT_DIR, imageFile);
        const outputPath = path.join(tempDir, `placeholder-${i + 1}.webp`);
        const storagePath = `practice-rooms/placeholder-${i + 1}.webp`;

        console.log(`\n[${i + 1}/${imageFiles.length}] Processing ${imageFile}`);

        // Convert to WebP
        const converted = await convertToWebP(inputPath, outputPath);
        if (!converted) {
            console.log('  ⚠️  Skipping upload (conversion failed)');
            continue;
        }

        // Upload to Supabase
        const url = await uploadToSupabase(outputPath, storagePath);
        if (url) {
            uploadedUrls.push(url);
        }

        // Clean up temp file
        fs.unlinkSync(outputPath);
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Upload Summary:');
    console.log(`  Successfully uploaded: ${uploadedUrls.length}/${imageFiles.length}`);
    console.log('='.repeat(60));

    if (uploadedUrls.length > 0) {
        console.log('\n✅ Uploaded URLs:');
        uploadedUrls.forEach((url, i) => {
            console.log(`  ${i + 1}. ${url}`);
        });

        console.log('\n💡 Next steps:');
        console.log('  1. Use these URLs in the admin UI to replace practice room images');
        console.log('  2. Or run: node scripts/optimize-practice-rooms.js --replace');
    }
}

main().catch(console.error);
