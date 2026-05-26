const db = require('../database-factory');
const fs = require('fs');
const path = require('path');

console.log("=== CLEARING OFFERS BANK ===");

try {
    // 1. Get all offers to see if there are physical files to delete (just in case)
    const offers = db.prepare("SELECT * FROM whatsapp_offers_bank").all();
    console.log(`Found ${offers.length} offers in the database.`);
    
    // 2. Empty the table
    const result = db.prepare("DELETE FROM whatsapp_offers_bank").run();
    console.log(`Successfully deleted ${result.changes} records from whatsapp_offers_bank.`);
    
    // 3. Optional: empty post history if any
    // const postsResult = db.prepare("DELETE FROM whatsapp_group_posts").run();
    // console.log(`Deleted ${postsResult.changes} records from whatsapp_group_posts.`);
    
    console.log("=== OFFERS BANK CLEARED SUCCESSFULLY ===");
} catch(e) {
    console.error("Error clearing offers bank:", e.message);
}
