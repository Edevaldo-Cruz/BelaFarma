const express = require('express');
const router = express.Router();
const os = require('os');
const fs = require('fs');
const path = require('path');
const baileysService = require('./baileys-service.js');
const secondaryService = require('./baileys-secondary-service.js');

module.exports = (db) => {

  router.get('/status', (req, res) => {
    try {
      const status = {
        database: {
          operational: false,
          sizeMB: 0
        },
        system: {
          uptimeSeconds: process.uptime(),
          totalMemoryMB: Math.round(os.totalmem() / 1024 / 1024),
          freeMemoryMB: Math.round(os.freemem() / 1024 / 1024),
          processMemoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024)
        },
        whatsappPrincipal: baileysService.getStatus(),
        whatsappSecundario: secondaryService.getStatus()
      };

      // Check DB operational status
      try {
        db.prepare('SELECT 1').get();
        status.database.operational = true;
      } catch (dbErr) {
        status.database.operational = false;
        status.database.error = dbErr.message;
      }

      // Check DB file size
      try {
        const dbPath = path.join(__dirname, 'belafarma.db');
        if (fs.existsSync(dbPath)) {
          const stats = fs.statSync(dbPath);
          status.database.sizeMB = (stats.size / 1024 / 1024).toFixed(2);
        }
      } catch (err) {
        console.error('Failed to get DB file size:', err);
      }

      res.json(status);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
