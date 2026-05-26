const db = require('../database-factory');

try {
    const targetGroup = db.prepare("SELECT value FROM system_settings WHERE key = 'auto_offer_group_id'").get();
    console.log("TARGET_GROUP:", targetGroup ? targetGroup.value : "None");
} catch(e) {
    console.log("TARGET_GROUP_ERROR:", e.message);
}

try {
    const offersCount = db.prepare("SELECT COUNT(*) as count FROM whatsapp_offers_bank").get();
    console.log("OFFERS_COUNT:", offersCount ? offersCount.count : 0);
} catch(e) {
    console.log("OFFERS_COUNT_ERROR:", e.message);
}

try {
    const offers = db.prepare("SELECT id, productName FROM whatsapp_offers_bank LIMIT 5").all();
    console.log("SAMPLE_OFFERS:", JSON.stringify(offers));
} catch(e) {
    console.log("SAMPLE_OFFERS_ERROR:", e.message);
}

try {
    const lastPosts = db.prepare("SELECT groupName, status, createdAt FROM whatsapp_group_posts ORDER BY createdAt DESC LIMIT 3").all();
    console.log("LAST_POSTS:", JSON.stringify(lastPosts));
} catch(e) {
    console.log("LAST_POSTS_ERROR:", e.message);
}
