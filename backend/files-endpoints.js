const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const reportsDir = path.join(__dirname, 'reports/digifarma');

// Garante que o diretório existe
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

// Configuração do Multer para relatórios
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, reportsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});


module.exports = (db) => {
  
  // Listar arquivos na central
  router.get('/', (req, res) => {
    try {
      const files = fs.readdirSync(reportsDir)
        .filter(f => f.endsWith('.csv') || f.endsWith('.pdf'))
        .map(f => {
          const stats = fs.statSync(path.join(reportsDir, f));
          return {
            name: f,
            size: stats.size,
            date: stats.mtime,
            type: f.endsWith('.pdf') ? 'application/pdf' : 'text/csv'
          };
        })
        .sort((a, b) => b.date - a.date);

      res.json(files);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Upload de novos arquivos (suporta múltiplos)
  router.post('/upload', upload.array('relatorio', 10), (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }
    
    const uploadedFiles = req.files.map(file => ({
      name: file.filename,
      size: file.size,
      date: new Date()
    }));

    res.json({ 
      message: `${uploadedFiles.length} arquivo(s) enviado(s) com sucesso!`,
      files: uploadedFiles
    });
  });

  // Deletar arquivo
  router.delete('/:filename', (req, res) => {
    const filePath = path.join(reportsDir, req.params.filename);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Arquivo não encontrado.' });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
