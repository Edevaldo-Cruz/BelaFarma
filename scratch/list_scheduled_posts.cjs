const db = require('../backend/database-factory');

async function run() {
    console.log('=== LISTING SCHEDULED GROUP POSTS IN DB ===');
    try {
        const posts = db.prepare('SELECT * FROM whatsapp_group_posts ORDER BY scheduledAt DESC LIMIT 20').all();
        console.log(`Found ${posts.length} posts:`);
        posts.forEach(p => {
            console.log(`\n- ID: ${p.id}`);
            console.log(`  Group: "${p.groupName}" (${p.groupId})`);
            console.log(`  Content: "${p.content.substring(0, 60)}..."`);
            console.log(`  Media Path: ${p.mediaPath || 'None'}`);
            console.log(`  Scheduled At: ${p.scheduledAt}`);
            console.log(`  Status: ${p.status}`);
            if (p.errorMessage) console.log(`  Error: ${p.errorMessage}`);
        });
    } catch (e) {
        console.error('Error querying database:', e.message);
    }
}

run();
