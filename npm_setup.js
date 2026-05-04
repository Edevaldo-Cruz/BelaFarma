
const sqlite3 = require('/app/node_modules/sqlite3').verbose();
const db = new sqlite3.Database('/data/database.sqlite');

const hosts = [
  {
    domain_names: '["app.drogariabelafarma.com.br"]',
    forward_host: 'frontend',
    forward_port: 80,
    block_exploits: 1,
    allow_websocket_upgrade: 1
  },
  {
    domain_names: '["www.drogariabelafarma.com.br", "drogariabelafarma.com.br"]',
    forward_host: 'frontend',
    forward_port: 80,
    block_exploits: 1,
    allow_websocket_upgrade: 1
  },
  {
    domain_names: '["valeouro.drogariabelafarma.com.br"]',
    forward_host: 'valeouro_app',
    forward_port: 3001,
    block_exploits: 1,
    allow_websocket_upgrade: 1
  }
];

db.serialize(() => {
  // Clear existing (just in case)
  db.run("DELETE FROM proxy_host");
  
  const stmt = db.prepare(`
    INSERT INTO proxy_host (
      created_on, modified_on, owner_user_id, domain_names, forward_host, forward_port, 
      access_list_id, certificate_id, ssl_forced, caching_enabled, block_exploits, 
      advanced_config, meta, allow_websocket_upgrade, http2_support, hsts_enabled, hsts_subdomains
    ) VALUES (
      DATETIME('now'), DATETIME('now'), 1, ?, ?, ?, 0, 0, 0, 0, ?, '', '{}', ?, 0, 0, 0
    )
  `);

  hosts.forEach(h => {
    stmt.run(h.domain_names, h.forward_host, h.forward_port, h.block_exploits, h.allow_websocket_upgrade);
  });

  stmt.finalize();
  
  console.log("Proxy hosts inserted successfully!");
});

db.close();
