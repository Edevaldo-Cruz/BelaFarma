const db = require('../database-factory');
const fs = require('fs');
const path = require('path');

console.log("=== VERIFYING UPLOADED ADS ===");

try {
    const offers = db.prepare("SELECT * FROM whatsapp_offers_bank").all();
    console.log(`Found ${offers.length} new offers in the database.`);
    
    // Check files
    const uploadDir = process.platform === 'win32'
      ? path.join(__dirname, '..', 'backend', 'public', 'uploads')
      : path.join(__dirname, 'uploads'); // inside data folder
      
    console.log(`Checking uploads in directory: ${uploadDir}`);
    
    offers.forEach((o, i) => {
        const basename = path.basename(o.mediaPath);
        const fullPath = path.join(uploadDir, basename);
        const exists = fs.existsSync(fullPath);
        console.log(`Ad #${i+1}: "${o.productName}"`);
        console.log(`  - Database path: ${o.mediaPath}`);
        console.log(`  - File exists on VPS disk? ${exists ? "YES! ✅" : "NO! ❌"}`);
        if (exists) {
            const stats = fs.statSync(fullPath);
            console.log(`  - File size: ${stats.size} bytes`);
        }
    });
    
    console.log("===============================");
} catch(e) {
    console.error("Error verifying ads:", e.message);
}
