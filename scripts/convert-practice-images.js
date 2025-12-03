#!/usr/bin/env node

/**
 * Convert Existing Practice Room Images to WebP
 * 
 * This script:
 * 1. Fetches all practice rooms from database
 * 2. Downloads existing images
 * 3. Converts them to optimized WebP format
 * 4. Uploads back to Supabase
 * 5. Updates database with new URLs
 * 
 * Usage:
 *   node scripts/convert-practice-images.js --analyze    # Show what needs conversion
 *   node scripts/convert-practice-images.js --convert    # Actually convert images
 */

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = 'https://mkoryudscamnopvxdelk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0ODA0ODIsImV4cCI6MjA3NTA1NjQ4Mn0.EgapnMjdLh9Wb7pWA4OKyaOZ0GpmJLZ_KHKcBaqc160';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function analyzeImages() {
    console.log('🔍 Analyzing practice room images...\n');

    const { data: rooms, error } = await supabase
        .from('practice_rooms')
        .select('*');

    if (error) {
        console.error('Error fetching rooms:', error);
        return [];
    }

    console.log(`Found ${rooms.length} practice rooms\n`);

    const analysis = [];

    for (const room of rooms) {
        let images = room.images;
        if (typeof images === 'string') {
            try {
                images = JSON.parse(images);
            } catch (e) {
                images = [];
            }
        }

        if (!Array.isArray(images)) images = [];

        const supabaseImages = images.filter(url =>
            url && url.includes('supabase') && !url.includes('readdy.ai')
        );

        const needsConversion = supabaseImages.filter(url => !url.includes('.webp'));

        if (supabaseImages.length > 0) {
            analysis.push({
                id: room.id,
                name: room.name,
                totalImages: images.length,
                supabaseImages: supabaseImages.length,
                needsConversion: needsConversion.length,
                images: supabaseImages,
                toConvert: needsConversion
            });

            console.log(`📍 ${room.name} (ID: ${room.id})`);
            console.log(`   Total images: ${images.length}`);
            console.log(`   Supabase images: ${supabaseImages.length}`);
            console.log(`   Needs conversion: ${needsConversion.length}`);
            if (needsConversion.length > 0) {
                needsConversion.forEach((url, i) => {
                    const ext = url.split('.').pop()?.split('?')[0] || 'unknown';
                    console.log(`     ${i + 1}. ${ext.toUpperCase()} - ${url.substring(0, 80)}...`);
                });
            }
            console.log();
        }
    }

    const totalNeedsConversion = analysis.reduce((sum, a) => sum + a.needsConversion, 0);
    const totalSupabaseImages = analysis.reduce((sum, a) => sum + a.supabaseImages, 0);

    console.log('='.repeat(70));
    console.log('📊 Summary:');
    console.log(`   Rooms with Supabase images: ${analysis.length}`);
    console.log(`   Total Supabase images: ${totalSupabaseImages}`);
    console.log(`   Images needing conversion: ${totalNeedsConversion}`);
    console.log('='.repeat(70));

    return analysis;
}

async function convertImages(dryRun = true) {
    console.log(`${dryRun ? '🔍 DRY RUN:' : '🔄 CONVERTING:'} Practice room images to WebP\n`);

    const analysis = await analyzeImages();
    const roomsToConvert = analysis.filter(a => a.needsConversion > 0);

    if (roomsToConvert.length === 0) {
        console.log('\n✅ All images are already optimized!');
        return;
    }

    console.log(`\n${roomsToConvert.length} rooms need image conversion\n`);

    if (dryRun) {
        console.log('Would convert images for:');
        roomsToConvert.forEach(room => {
            console.log(`  - ${room.name}: ${room.needsConversion} images`);
        });
        console.log('\n💡 Run with --convert to actually convert images');
        console.log('⚠️  Note: Requires sharp library (npm install sharp)');
        return;
    }

    // Check if sharp is available
    let sharp;
    try {
        sharp = (await import('sharp')).default;
    } catch (e) {
        console.error('\n❌ Error: sharp library not found');
        console.log('Install it with: npm install sharp --save-dev\n');
        return;
    }

    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    let totalConverted = 0;
    let totalErrors = 0;

    for (const room of roomsToConvert) {
        console.log(`\n${'='.repeat(70)}`);
        console.log(`📍 Converting images for: ${room.name}`);
        console.log('='.repeat(70));

        const newImageUrls = [];
        let images = room.images;

        for (let i = 0; i < images.length; i++) {
            const url = images[i];

            // Skip if already WebP or external
            if (url.includes('.webp') || url.includes('readdy.ai')) {
                newImageUrls.push(url);
                continue;
            }

            // Skip if not Supabase
            if (!url.includes('supabase')) {
                newImageUrls.push(url);
                continue;
            }

            console.log(`\n  [${i + 1}/${images.length}] Converting image...`);

            try {
                // Download image
                console.log('    ⬇️  Downloading...');
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const buffer = Buffer.from(await response.arrayBuffer());
                const tempInput = path.join(tempDir, `temp-${room.id}-${i}.jpg`);
                fs.writeFileSync(tempInput, buffer);

                const originalSize = buffer.length;
                console.log(`    📦 Original: ${(originalSize / 1024).toFixed(1)} KB`);

                // Convert to WebP
                console.log('    🔄 Converting to WebP...');
                const tempOutput = path.join(tempDir, `temp-${room.id}-${i}.webp`);

                await sharp(tempInput)
                    .resize(800, 600, { fit: 'cover', withoutEnlargement: true })
                    .webp({ quality: 85 })
                    .toFile(tempOutput);

                const webpBuffer = fs.readFileSync(tempOutput);
                const webpSize = webpBuffer.length;
                const savings = ((1 - webpSize / originalSize) * 100).toFixed(1);
                console.log(`    ✅ WebP: ${(webpSize / 1024).toFixed(1)} KB (${savings}% smaller)`);

                // Upload to Supabase
                console.log('    ⬆️  Uploading to Supabase...');
                const storagePath = `practice-rooms/optimized-${room.id}-${i}-${Date.now()}.webp`;

                const { error: uploadError } = await supabase.storage
                    .from('images')
                    .upload(storagePath, webpBuffer, {
                        contentType: 'image/webp',
                        cacheControl: '31536000',
                        upsert: true
                    });

                if (uploadError) throw uploadError;

                const { data: urlData } = supabase.storage
                    .from('images')
                    .getPublicUrl(storagePath);

                newImageUrls.push(urlData.publicUrl);
                console.log(`    ✅ Uploaded!`);

                // Clean up temp files
                fs.unlinkSync(tempInput);
                fs.unlinkSync(tempOutput);

                totalConverted++;

            } catch (error) {
                console.error(`    ❌ Error: ${error.message}`);
                newImageUrls.push(url); // Keep original on error
                totalErrors++;
            }
        }

        // Update database
        if (newImageUrls.length > 0 && newImageUrls.some(u => u.includes('.webp'))) {
            console.log(`\n  💾 Updating database...`);

            const { error: updateError } = await supabase
                .from('practice_rooms')
                .update({
                    images: JSON.stringify(newImageUrls),
                    image: newImageUrls[0]
                })
                .eq('id', room.id);

            if (updateError) {
                console.error(`  ❌ Database update failed: ${updateError.message}`);
            } else {
                console.log(`  ✅ Database updated`);
            }
        }
    }

    console.log('\n' + '='.repeat(70));
    console.log('📊 Conversion Summary:');
    console.log(`   Images converted: ${totalConverted}`);
    console.log(`   Errors: ${totalErrors}`);
    console.log('='.repeat(70));

    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
    }
}

async function main() {
    const args = process.argv.slice(2);
    const mode = args[0] || '--analyze';

    console.log('🚀 Practice Room Image Converter\n');

    switch (mode) {
        case '--analyze':
            await analyzeImages();
            console.log('\n💡 Next step: node scripts/convert-practice-images.js --convert');
            break;
        case '--dry-run':
            await convertImages(true);
            break;
        case '--convert':
            await convertImages(false);
            break;
        default:
            console.log('Usage:');
            console.log('  node scripts/convert-practice-images.js --analyze    # Analyze images');
            console.log('  node scripts/convert-practice-images.js --dry-run    # Preview conversion');
            console.log('  node scripts/convert-practice-images.js --convert    # Convert images');
    }
}

main().catch(console.error);
