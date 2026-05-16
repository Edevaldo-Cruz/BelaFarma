const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'belafarma_atende',
  password: 'Belafarma2026',
  port: 5432,
});

async function check() {
  try {
    const res = await pool.query('SELECT COUNT(*) FROM chat_history');
    console.log('Chat History Count:', res.rows[0].count);
    
    const sample = await pool.query('SELECT * FROM chat_history ORDER BY created_at DESC LIMIT 3');
    console.log('Sample Records:', JSON.stringify(sample.rows, null, 2));
    
    await pool.end();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
