
const db = require('./database.js');

console.log('=== DEBUGGING JSON DATA IN DATABASE ===');

function isJson(str) {
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
}

function checkTable(tableName, jsonColumns) {
  console.log(`\nChecking table: ${tableName}`);
  try {
    const rows = db.prepare(`SELECT * FROM ${tableName}`).all();
    console.log(`Found ${rows.length} rows.`);
    
    let errorCount = 0;
    
    rows.forEach(row => {
      jsonColumns.forEach(col => {
        if (!row[col]) return; // Skip null/empty if that's allowed (or not)
        
        try {
            JSON.parse(row[col]);
        } catch (e) {
            console.error(`❌ INVALID JSON in table '${tableName}', id '${row.id}', column '${col}':`);
            console.error(`   Value: "${row[col]}"`);
            console.error(`   Error: ${e.message}`);
            errorCount++;
        }
      });
    });
    
    if (errorCount === 0) {
      console.log(`✅ All JSON columns in ${tableName} are valid.`);
    } else {
        console.error(`🚨 Found ${errorCount} JSON errors in ${tableName}.`);
    }

  } catch (e) {
    // Table might not exist
    console.warn(`Could not check table ${tableName}: ${e.message}`);
  }
}

checkTable('daily_records', ['expenses', 'nonRegistered', 'pixDiretoList', 'crediarioList']);
checkTable('orders', ['installments']);
checkTable('tasks', ['recurrenceDaysOfWeek', 'annotations']);
checkTable('cash_closings', ['crediarioList']);
checkTable('bugs', ['screenshots']);
checkTable('flyering_tasks', ['coordinates']);

console.log('\n=== DONE ===');
