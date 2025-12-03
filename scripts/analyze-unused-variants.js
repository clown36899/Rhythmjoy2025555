#!/usr/bin/env node

/**
 * Analyze which image variants (thumbnail/medium/full) are actually used
 * vs just stored in database but never rendered on the site
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mkoryudscamnopvxdelk.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function extractStoragePath(url) {
    if (!url) return null;
    try {
        const match = url.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+?)(\?|$)/);
        return match ? decodeURIComponent(match[1]) : null;
    } catch (e) {
        return null;
    }
}

async function analyzeImageVariants() {
    console.log('🔍 Analyzing image variant usage...\n');

    // Get all events with images
    const { data: events, error } = await supabase
        .from('events')
        .select('id, title, image, image_thumbnail, image_medium, image_full');

    if (error) {
        console.error('Error fetching events:', error);
        return;
    }

    const stats = {
        totalEvents: events.length,
        withAnyImage: 0,
        withThumbnail: 0,
        withMedium: 0,
        withFull: 0,
        withAllThree: 0,
        potentialWaste: []
    };

    let totalThumbnailSize = 0;
    let totalMediumSize = 0;
    let totalFullSize = 0;

    for (const event of events) {
        const hasImage = !!(event.image || event.image_thumbnail || event.image_medium || event.image_full);
        const hasThumbnail = !!event.image_thumbnail;
        const hasMedium = !!event.image_medium;
        const hasFull = !!event.image_full;

        if (hasImage) stats.withAnyImage++;
        if (hasThumbnail) stats.withThumbnail++;
        if (hasMedium) stats.withMedium++;
        if (hasFull) stats.withFull++;
        if (hasThumbnail && hasMedium && hasFull) stats.withAllThree++;

        // Check for potential waste: has all 3 variants but might not need all
        if (hasThumbnail && hasMedium && hasFull) {
            const thumbnailPath = extractStoragePath(event.image_thumbnail);
            const mediumPath = extractStoragePath(event.image_medium);
            const fullPath = extractStoragePath(event.image_full);

            // Get file sizes
            let thumbnailSize = 0, mediumSize = 0, fullSize = 0;

            if (thumbnailPath) {
                const { data: thumbFile } = await supabase.storage
                    .from('images')
                    .list(thumbnailPath.split('/')[0], {
                        search: thumbnailPath.split('/').pop()
                    });
                if (thumbFile?.[0]) {
                    thumbnailSize = thumbFile[0].metadata?.size || 0;
                    totalThumbnailSize += thumbnailSize;
                }
            }

            if (mediumPath) {
                const { data: medFile } = await supabase.storage
                    .from('images')
                    .list(mediumPath.split('/')[0], {
                        search: mediumPath.split('/').pop()
                    });
                if (medFile?.[0]) {
                    mediumSize = medFile[0].metadata?.size || 0;
                    totalMediumSize += mediumSize;
                }
            }

            if (fullPath) {
                const { data: fullFile } = await supabase.storage
                    .from('images')
                    .list(fullPath.split('/')[0], {
                        search: fullPath.split('/').pop()
                    });
                if (fullFile?.[0]) {
                    fullSize = fullFile[0].metadata?.size || 0;
                    totalFullSize += fullSize;
                }
            }

            stats.potentialWaste.push({
                eventId: event.id,
                eventTitle: event.title,
                thumbnailSize,
                mediumSize,
                fullSize,
                totalSize: thumbnailSize + mediumSize + fullSize
            });
        }
    }

    console.log('='.repeat(80));
    console.log('📊 IMAGE VARIANT USAGE ANALYSIS');
    console.log('='.repeat(80));
    console.log(`\nTotal Events: ${stats.totalEvents}`);
    console.log(`Events with any image: ${stats.withAnyImage}`);
    console.log(`\nVariant Distribution:`);
    console.log(`  - Has thumbnail: ${stats.withThumbnail} (${((stats.withThumbnail / stats.totalEvents) * 100).toFixed(1)}%)`);
    console.log(`  - Has medium: ${stats.withMedium} (${((stats.withMedium / stats.totalEvents) * 100).toFixed(1)}%)`);
    console.log(`  - Has full: ${stats.withFull} (${((stats.withFull / stats.totalEvents) * 100).toFixed(1)}%)`);
    console.log(`  - Has all 3 variants: ${stats.withAllThree} (${((stats.withAllThree / stats.totalEvents) * 100).toFixed(1)}%)`);

    console.log(`\nTotal Storage by Variant:`);
    console.log(`  - Thumbnails: ${(totalThumbnailSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  - Medium: ${(totalMediumSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  - Full: ${(totalFullSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  - Total: ${((totalThumbnailSize + totalMediumSize + totalFullSize) / 1024 / 1024).toFixed(2)} MB`);

    console.log('\n' + '-'.repeat(80));
    console.log('💡 USAGE PATTERNS IN CODE:');
    console.log('-'.repeat(80));
    console.log(`
Based on code analysis:
  ✅ image_thumbnail - USED in:
     - EventCard (list/card views)
     - getEventThumbnail utility
     - FullscreenDateEventsModal
  
  ✅ image_medium - USED in:
     - EventDetailContent (detail page)
     - EventDetailModal
     - FullscreenDateEventsModal
  
  ✅ image_full - USED in:
     - Billboard page (large displays)
     - EventDetailContent (fallback)
     - EventDetailModal (fallback)
    `);

    console.log('-'.repeat(80));
    console.log('🎯 RECOMMENDATION:');
    console.log('-'.repeat(80));
    console.log(`
All 3 variants ARE being used in the codebase.
However, you could optimize by:

1. Events NOT shown on billboard don't need image_full
   - Check which events are actually used in billboard
   - Delete image_full for non-billboard events
   - Potential savings: ~${(totalFullSize / 1024 / 1024 * 0.7).toFixed(2)} MB (estimated 70%)

2. If you want to reduce bandwidth further:
   - Use smaller thumbnail sizes (currently might be too large)
   - Compress medium images more aggressively
    `);

    console.log('='.repeat(80));
}

analyzeImageVariants().catch(console.error);
