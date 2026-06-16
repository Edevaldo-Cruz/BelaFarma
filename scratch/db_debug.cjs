const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '../belafarma.db'));
try {
  const rows = db.prepare("SELECT * FROM scraped_images WHERE image_url IS NOT NULL LIMIT 5").all();
  console.log("Images in DB:", rows);
} catch (e) {
  console.error("Error querying DB:", e);
}
