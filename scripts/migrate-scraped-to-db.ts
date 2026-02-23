import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load env
dotenv.config();

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || ''; // Use service key for migration

if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase env vars missing. Check .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
    console.log('--- Starting Migration: JSON -> DB ---');

    const jsonPath = path.resolve('src/data/scraped_events.json');
    if (!fs.existsSync(jsonPath)) {
        console.error('File not found:', jsonPath);
        return;
    }

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    console.log(`Found ${data.length} items to migrate.`);

    for (const item of data) {
        const { error } = await supabase
            .from('scraped_events')
            .upsert({
                id: item.id,
                keyword: item.keyword,
                source_url: item.source_url,
                poster_url: item.poster_url,
                extracted_text: item.extracted_text,
                structured_data: item.structured_data || item.parsed_data,
                created_at: item.created_at
            });

        if (error) {
            console.error(`- Error migrating ${item.id}:`, error.message);
        } else {
            console.log(`- Migrated: ${item.id}`);
        }
    }

    console.log('--- Migration Finished ---');
}

migrate();
