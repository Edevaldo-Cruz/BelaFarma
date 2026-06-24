const db = require('../database'); 
const count = db.prepare("SELECT count(*) as c FROM shortages WHERE source='auto'").get(); 
console.log('Faltas automaticas:', count);

const sample = db.prepare("SELECT * FROM shortages WHERE source='auto' ORDER BY createdAt DESC LIMIT 3").all();
console.log(sample);
