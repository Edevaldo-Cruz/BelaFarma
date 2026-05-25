const db = require('../backend/database-factory');

async function checkPosts() {
  try {
    console.log('--- ÚLTIMOS 10 REGISTROS DE DISPARO ---');
    const posts = await db.prepare('SELECT id, groupId, groupName, status, errorMessage, scheduledAt, sentAt, createdAt FROM whatsapp_group_posts ORDER BY createdAt DESC LIMIT 10').all();
    console.log(JSON.stringify(posts, null, 2));
    
    console.log('\n--- CONTEXTO CLIMA / AGENDAMENTO ---');
    const offers = await db.prepare('SELECT count(*) as count FROM whatsapp_offers_bank').get();
    console.log(`Total de ofertas no banco: ${offers.count}`);

    const customGroups = await db.prepare('SELECT * FROM whatsapp_custom_groups').all();
    console.log('Grupos Customizados no SQLite:', JSON.stringify(customGroups, null, 2));
    
  } catch (err) {
    console.error('Erro ao ler banco de dados:', err);
  }
}

checkPosts();
