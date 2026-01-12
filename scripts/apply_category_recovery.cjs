const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL || 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function recover() {
    console.log('🏗️ Starting Category Recovery Process...');

    // 1. Fetch Orphaned Nodes
    const { data: nodes, error: nodeError } = await supabase
        .from('history_nodes')
        .select('*')
        .in('category', ['folder', 'canvas', 'general'])
        .is('linked_category_id', null)
        .not('title', 'is', null);

    if (nodeError) {
        console.error('Failed to fetch nodes:', nodeError);
        return;
    }

    console.log(`Found ${nodes.length} orphaned nodes.`);
    const uniqueMap = new Map();

    // Group by title to create unique categories
    nodes.forEach(node => {
        if (!uniqueMap.has(node.title)) {
            uniqueMap.set(node.title, node);
        }
    });

    console.log(`Unique categories to create: ${uniqueMap.size}`);

    for (const [title, node] of uniqueMap) {
        console.log(`\nProcessing: ${title}`);

        // 2. Create Category
        const { data: newCat, error: createError } = await supabase
            .from('learning_categories')
            .insert({
                name: node.title,
                metadata: {
                    description: node.description || '',
                    subtype: node.category === 'canvas' ? 'canvas' : 'folder'
                },
                user_id: node.user_id,
                created_at: node.created_at
            })
            .select()
            .single();

        if (createError) {
            console.error(`Failed to create category for ${title}:`, createError);
            continue;
        }

        console.log(`✅ Created Category ID: ${newCat.id}`);

        // 3. Link Nodes & 4. Cleanup (Source of Truth)
        const { error: updateError } = await supabase
            .from('history_nodes')
            .update({
                linked_category_id: newCat.id
                // title: null,       // Pending: Schema has NOT NULL constraint
                // description: null  // Pending: Schema has NOT NULL constraint
            })
            .eq('title', title)
            .is('linked_category_id', null);

        if (updateError) {
            console.error(`Failed to link nodes for ${title}:`, updateError);
        } else {
            console.log(`🔗 Nodes linked and cleaned up successfully.`);
        }
    }

    console.log('\n🎉 Recovery Process Completed!');
}

recover().then(() => process.exit(0));
