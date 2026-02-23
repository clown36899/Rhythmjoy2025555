
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();
dotenv.config({ path: '.env.local' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const SUPABASE_URL = process.env.VITE_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Error: Missing Supabase credentials.');
    console.error('Please ensure VITE_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env or .env.local');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
    try {
        // 1. Get Version
        const packageJsonPath = path.resolve(__dirname, '../package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        const version = packageJson.version;
        const title = `Version ${version} 업데이트 안내`;

        console.log(`\n📢 Publishing Dev Log for ${title}...\n`);

        // 2. Check if already exists
        const { data: existing } = await supabase
            .from('board_posts')
            .select('id')
            .eq('category', 'dev-log')
            .eq('title', title)
            .single();

        if (existing) {
            console.warn(`⚠️  Log for version ${version} already exists. Skipping.`);
            process.exit(0);
        }

        // 3. Get Content (Interactive)
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        console.log('📝 Enter release notes (Press Ctrl+D or type "EOF" on a new line to finish):');

        let content = '';
        for await (const line of rl) {
            if (line.trim() === 'EOF') break;
            content += line + '\n';
        }

        if (!content.trim()) {
            console.error('❌ Error: Content cannot be empty.');
            process.exit(1);
        }

        content = content.trim();

        // 4. Find Admin User (Author)
        const { data: users, error: userError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });

        if (userError || !users.users.length) {
            throw new Error('Failed to find an admin user to post as.');
        }

        const adminUser = users.users[0];
        const authorName = adminUser.user_metadata?.name || adminUser.email?.split('@')[0] || 'Admin';

        // 5. Insert Post
        const { error: insertError } = await supabase
            .from('board_posts')
            .insert({
                title,
                content,
                category: 'dev-log',
                user_id: adminUser.id,
                author_name: authorName,
                view_count: 0,
                is_notice: true
            });

        if (insertError) throw insertError;

        console.log(`\n✅ Successfully published: "${title}"`);

    } catch (error) {
        console.error('\n❌ Failed to publish log:', error);
        process.exit(1);
    }
}

main();
