// notes-endpoints.js
// Endpoints para gerenciamento do Bloco de Notas (Anotações Livres)

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const notesUploadDir = path.join(__dirname, 'uploads/notes');
if (!fs.existsSync(notesUploadDir)) {
  fs.mkdirSync(notesUploadDir, { recursive: true });
}

// Configuração de upload para imagens inseridas nas anotações
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, notesUploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    const uniqueName = 'note-img-' + Date.now() + '-' + Math.round(Math.random() * 1E6) + ext;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas'));
    }
  }
});

module.exports = (db) => {
  // Inicialização da tabela de anotações
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'public',
      allow_edit INTEGER NOT NULL DEFAULT 1,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT 'Geral',
      color TEXT DEFAULT '#3b82f6',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_edited_by TEXT
    )
  `);

  // Criar índices para agilidade nas consultas
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_notes_visibility ON notes(visibility)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_notes_author ON notes(author_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(is_pinned)`);
  } catch (e) {
    // Índices já existem ou erro silencioso
  }

  // 1. LISTAR NOTAS (com filtro por perfil e privacidade do usuário)
  router.get('/', (req, res) => {
    try {
      const { userId, userRole, category, search } = req.query;
      const isAdmin = userRole === 'Administrador' || userRole === 'ADM';

      let sql = 'SELECT * FROM notes WHERE 1=1';
      const params = [];

      // Filtro de Visibilidade / Privacidade:
      // - ADM vê: Públicas + Apenas ADM + suas próprias notas privadas
      // - Operador/Outro vê: Públicas + suas próprias notas
      if (isAdmin) {
        sql += ` AND (visibility = 'public' OR visibility = 'admin' OR author_id = ?)`;
        params.push(userId || '');
      } else {
        sql += ` AND (visibility = 'public' OR author_id = ?)`;
        params.push(userId || '');
      }

      if (category && category !== 'Todas') {
        sql += ` AND category = ?`;
        params.push(category);
      }

      if (search && search.trim() !== '') {
        sql += ` AND (title LIKE ? OR content LIKE ?)`;
        params.push(`%${search.trim()}%`, `%${search.trim()}%`);
      }

      sql += ' ORDER BY is_pinned DESC, updated_at DESC';

      const notes = db.prepare(sql).all(...params);

      const formattedNotes = notes.map(n => ({
        ...n,
        allow_edit: Boolean(n.allow_edit),
        is_pinned: Boolean(n.is_pinned)
      }));

      res.json({ success: true, notes: formattedNotes });
    } catch (err) {
      console.error('[NOTES API] Erro ao listar notas:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 2. OBTER UMA NOTA POR ID
  router.get('/:id', (req, res) => {
    try {
      const { id } = req.params;
      const { userId, userRole } = req.query;
      const isAdmin = userRole === 'Administrador' || userRole === 'ADM';

      const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
      if (!note) {
        return res.status(404).json({ success: false, error: 'Anotação não encontrada' });
      }

      const isAuthor = note.author_id === userId;
      if (!isAuthor) {
        if (note.visibility === 'private') {
          return res.status(403).json({ success: false, error: 'Acesso negado. Anotação privada.' });
        }
        if (note.visibility === 'admin' && !isAdmin) {
          return res.status(403).json({ success: false, error: 'Acesso restrito a Administradores.' });
        }
      }

      res.json({
        success: true,
        note: {
          ...note,
          allow_edit: Boolean(note.allow_edit),
          is_pinned: Boolean(note.is_pinned)
        }
      });
    } catch (err) {
      console.error('[NOTES API] Erro ao buscar nota:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 3. CRIAR NOVA NOTA
  router.post('/', (req, res) => {
    try {
      const {
        title,
        content = '',
        author_id,
        author_name,
        visibility = 'public',
        allow_edit = true,
        is_pinned = false,
        category = 'Geral',
        color = '#3b82f6'
      } = req.body;

      if (!title || !title.trim()) {
        return res.status(400).json({ success: false, error: 'Título é obrigatório' });
      }

      if (!author_id || !author_name) {
        return res.status(400).json({ success: false, error: 'Autor não identificado' });
      }

      const id = 'note_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
      const now = new Date().toISOString();

      const stmt = db.prepare(`
        INSERT INTO notes (
          id, title, content, author_id, author_name,
          visibility, allow_edit, is_pinned, category, color,
          created_at, updated_at, last_edited_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        title.trim(),
        content,
        author_id,
        author_name,
        visibility,
        allow_edit ? 1 : 0,
        is_pinned ? 1 : 0,
        category,
        color,
        now,
        now,
        author_name
      );

      const createdNote = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);

      res.status(201).json({
        success: true,
        note: {
          ...createdNote,
          allow_edit: Boolean(createdNote.allow_edit),
          is_pinned: Boolean(createdNote.is_pinned)
        }
      });
    } catch (err) {
      console.error('[NOTES API] Erro ao criar nota:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4. ATUALIZAR NOTA EXISTENTE
  router.put('/:id', (req, res) => {
    try {
      const { id } = req.params;
      const {
        title,
        content,
        visibility,
        allow_edit,
        is_pinned,
        category,
        color,
        userId,
        userName,
        userRole
      } = req.body;

      const currentNote = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
      if (!currentNote) {
        return res.status(404).json({ success: false, error: 'Anotação não encontrada' });
      }

      const isAdmin = userRole === 'Administrador' || userRole === 'ADM';
      const isAuthor = currentNote.author_id === userId;
      const isCollaborative = Boolean(currentNote.allow_edit);

      if (!isAuthor && !isAdmin) {
        if (!isCollaborative) {
          return res.status(403).json({
            success: false,
            error: 'Esta anotação está definida como Somente Leitura pelo autor.'
          });
        }
        if (currentNote.visibility === 'admin') {
          return res.status(403).json({
            success: false,
            error: 'Acesso restrito a Administradores.'
          });
        }
        if (currentNote.visibility === 'private') {
          return res.status(403).json({
            success: false,
            error: 'Acesso negado a anotação privada.'
          });
        }
      }

      const updatedTitle = title !== undefined ? title.trim() : currentNote.title;
      const updatedContent = content !== undefined ? content : currentNote.content;
      const updatedVisibility = (isAuthor || isAdmin) && visibility !== undefined ? visibility : currentNote.visibility;
      const updatedAllowEdit = (isAuthor || isAdmin) && allow_edit !== undefined ? (allow_edit ? 1 : 0) : currentNote.allow_edit;
      const updatedIsPinned = is_pinned !== undefined ? (is_pinned ? 1 : 0) : currentNote.is_pinned;
      const updatedCategory = category !== undefined ? category : currentNote.category;
      const updatedColor = color !== undefined ? color : currentNote.color;
      const now = new Date().toISOString();
      const editorName = userName || currentNote.author_name;

      const stmt = db.prepare(`
        UPDATE notes
        SET title = ?,
            content = ?,
            visibility = ?,
            allow_edit = ?,
            is_pinned = ?,
            category = ?,
            color = ?,
            updated_at = ?,
            last_edited_by = ?
        WHERE id = ?
      `);

      stmt.run(
        updatedTitle,
        updatedContent,
        updatedVisibility,
        updatedAllowEdit,
        updatedIsPinned,
        updatedCategory,
        updatedColor,
        now,
        editorName,
        id
      );

      const updatedNote = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);

      res.json({
        success: true,
        note: {
          ...updatedNote,
          allow_edit: Boolean(updatedNote.allow_edit),
          is_pinned: Boolean(updatedNote.is_pinned)
        }
      });
    } catch (err) {
      console.error('[NOTES API] Erro ao atualizar nota:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 5. EXCLUIR NOTA
  router.delete('/:id', (req, res) => {
    try {
      const { id } = req.params;
      const { userId, userRole } = req.query;

      const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
      if (!note) {
        return res.status(404).json({ success: false, error: 'Anotação não encontrada' });
      }

      const isAdmin = userRole === 'Administrador' || userRole === 'ADM';
      const isAuthor = note.author_id === userId;

      if (!isAuthor && !isAdmin) {
        return res.status(403).json({
          success: false,
          error: 'Apenas o autor ou um Administrador pode excluir esta anotação.'
        });
      }

      db.prepare('DELETE FROM notes WHERE id = ?').run(id);

      res.json({ success: true, message: 'Anotação excluída com sucesso' });
    } catch (err) {
      console.error('[NOTES API] Erro ao excluir nota:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 6. UPLOAD DE IMAGEM PARA INSERÇÃO NA NOTA
  router.post('/upload-image', upload.single('image'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'Nenhum arquivo de imagem recebido' });
      }

      const imageUrl = `/uploads/notes/${req.file.filename}`;
      res.json({
        success: true,
        imageUrl: imageUrl,
        filename: req.file.filename
      });
    } catch (err) {
      console.error('[NOTES API] Erro no upload de imagem:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};

