const Database = require('better-sqlite3');
const PixBotService = require('./services/pix-bot.service.js');
const db = new Database('../data/belafarma.db');
const pixBot = new PixBotService(db);
pixBot.confirmPix({ value: 50.00, senderName: 'Edevaldo', date: '05/06/2026', reason: 'OK' }, '5532988634755', 'msg123');
