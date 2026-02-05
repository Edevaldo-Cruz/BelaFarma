const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Get the latest backup file automatically if not specified
const backupDir = path.join(__dirname, '../backups_dev_simulated');
let backupFile = process.argv[2];

if (!backupFile) {
    try {
        const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.db'));
        if (files.length > 0) {
            // Sort by time, newest first (simplified assumption based on ISO string name or stat)
            // Ideally we check mtime, but alphabetical ISO works for sorting if format is consistent.
            // The format is belafarma_YYYY-MM-DD...
            files.sort().reverse(); 
            backupFile = files[0];
            console.log(`No file specified, using latest: ${backupFile}`);
        }
    } catch (e) {
        console.error("Could not list backups:", e.message);
        process.exit(1);
    }
}

if (!backupFile) {
    console.error("No backup files found to test.");
    process.exit(1);
}

const backupPath = path.join(backupDir, backupFile);

console.log(`--- Verifying Backup Integrity ---`);
console.log(`Target: ${backupPath}`);

try {
  if (!fs.existsSync(backupPath)) {
      throw new Error(`File not found: ${backupPath}`);
  }

  const db = new Database(backupPath, { readonly: true });
  
  // Check Users
  const users = db.prepare('SELECT id, name, role FROM users').all();
  console.log(`\n[Users Table] Count: ${users.length}`);
  console.table(users);

  // Check Orders Count to see if it has data
  try {
      const orderCount = db.prepare('SELECT COUNT(*) as count FROM orders').get();
      console.log(`\n[Orders Table] Total orders: ${orderCount.count}`);
  } catch(e) { console.log("Orders table check failed or empty"); }

  db.close();
  console.log("\nBackup read successfully.");

} catch (error) {
  console.error('\nCRITICAL: Error reading backup:', error.message);
}
