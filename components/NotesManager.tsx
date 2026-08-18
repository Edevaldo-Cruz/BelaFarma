import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  NotebookPen,
  Search,
  Plus,
  Pin,
  PinOff,
  Trash2,
  Lock,
  Shield,
  Globe,
  Printer,
  Copy,
  Save,
  Check,
  Tag,
  Palette,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  CheckSquare,
  Link as LinkIcon,
  Image as ImageIcon,
  Table as TableIcon,
  Eraser,
  Undo,
  Redo,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Clock,
  X
} from 'lucide-react';
import { Note, NoteVisibility, User, UserRole } from '../types';

interface NotesManagerProps {
  user: User;
  theme?: 'light' | 'dark';
}

const DEFAULT_CATEGORIES = [
  'Geral',
  'Farmácia',
  'Procedimentos',
  'Avisos',
  'Ideias',
  'Financeiro',
  'Importante',
  'Atendimento'
];

const COLOR_PALETTES = [
  { name: 'Azul', value: '#3b82f6', bgClass: 'bg-blue-500' },
  { name: 'Esmeralda', value: '#10b981', bgClass: 'bg-emerald-500' },
  { name: 'Âmbar', value: '#f59e0b', bgClass: 'bg-amber-500' },
  { name: 'Vermelho', value: '#ef4444', bgClass: 'bg-red-500' },
  { name: 'Roxo', value: '#8b5cf6', bgClass: 'bg-purple-500' },
  { name: 'Rosa', value: '#ec4899', bgClass: 'bg-pink-500' },
  { name: 'Índigo', value: '#6366f1', bgClass: 'bg-indigo-500' },
  { name: 'Cinza', value: '#64748b', bgClass: 'bg-slate-500' },
];

export const NotesManager: React.FC<NotesManagerProps> = ({ user, theme = 'light' }) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Todas');
  const [visibilityTab, setVisibilityTab] = useState<'all' | 'mine' | 'public' | 'pinned'>('all');
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'editor'>('list');

  // Modais
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [showTableModal, setShowTableModal] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  const [showToast, setShowToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Editor states
  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [fontColor, setFontColor] = useState('#0f172a');
  const [highlightColor, setHighlightColor] = useState('#fef08a');
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

  const isAdmin = user.role === UserRole.ADM;

  const triggerToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setShowToast({ message, type });
    setTimeout(() => setShowToast(null), 3500);
  };

  // Carrega lista de notas
  const fetchNotes = useCallback(async (selectFirst = false, selectId?: string) => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams({
        userId: user.id,
        userRole: user.role,
        ...(categoryFilter !== 'Todas' ? { category: categoryFilter } : {}),
        ...(searchTerm.trim() ? { search: searchTerm.trim() } : {})
      });

      const res = await fetch(`/api/notes?${queryParams.toString()}`);
      const data = await res.json();

      if (data.success && Array.isArray(data.notes)) {
        setNotes(data.notes);
        if (selectId) {
          const found = data.notes.find((n: Note) => n.id === selectId);
          if (found) setSelectedNote(found);
        } else if (selectFirst && data.notes.length > 0 && !selectedNote) {
          setSelectedNote(data.notes[0]);
        }
      }
    } catch (err: any) {
      console.error('Erro ao carregar notas:', err);
      triggerToast('Erro ao carregar anotações', 'error');
    } finally {
      setLoading(false);
    }
  }, [user.id, user.role, categoryFilter, searchTerm]);

  useEffect(() => {
    fetchNotes(true);
  }, [categoryFilter, fetchNotes]);

  // Atualiza contagem de palavras/caracteres e sincroniza editor ao selecionar nota
  useEffect(() => {
    if (selectedNote && editorRef.current) {
      if (editorRef.current.innerHTML !== selectedNote.content) {
        editorRef.current.innerHTML = selectedNote.content || '';
      }
      updateCounts();
      setHasUnsavedChanges(false);
    }
  }, [selectedNote?.id]);

  const updateCounts = () => {
    if (editorRef.current) {
      const text = editorRef.current.innerText || '';
      setCharCount(text.length);
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      setWordCount(words);
    }
  };

  // Executa comandos de formatação no contentEditable
  const executeCommand = (command: string, value: string | undefined = undefined) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    handleEditorInput();
  };

  const handleEditorInput = () => {
    updateCounts();
    setHasUnsavedChanges(true);
  };

  // Inserção de tabela estilizada
  const handleInsertTable = () => {
    if (!editorRef.current) return;
    let tableHtml = '<table style="width:100%; border-collapse:collapse; margin:16px 0; border:1px solid #cbd5e1;">';
    tableHtml += '<thead><tr style="background:#f1f5f9;">';
    for (let c = 0; c < tableCols; c++) {
      tableHtml += `<th style="border:1px solid #cbd5e1; padding:8px 12px; font-weight:bold; text-align:left;">Cabeçalho ${c + 1}</th>`;
    }
    tableHtml += '</tr></thead><tbody>';
    for (let r = 0; r < tableRows; r++) {
      tableHtml += '<tr>';
      for (let c = 0; c < tableCols; c++) {
        tableHtml += '<td style="border:1px solid #cbd5e1; padding:8px 12px;">Texto</td>';
      }
      tableHtml += '</tr>';
    }
    tableHtml += '</tbody></table><p><br></p>';
    executeCommand('insertHTML', tableHtml);
    setShowTableModal(false);
  };

  // Inserção de link
  const handleInsertLink = () => {
    if (!linkUrl) return;
    const url = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`;
    if (linkText) {
      const linkHtml = `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#2563eb; text-decoration:underline;">${linkText}</a>`;
      executeCommand('insertHTML', linkHtml);
    } else {
      executeCommand('createLink', url);
    }
    setLinkUrl('');
    setLinkText('');
    setShowLinkModal(false);
  };

  // Inserção de Checklist Interativo
  const handleInsertChecklist = () => {
    const checkHtml = `
      <div style="display:flex; align-items:center; gap:8px; margin:4px 0;">
        <input type="checkbox" style="width:18px; height:18px; cursor:pointer; accent-color:#ef4444;" />
        <span>Item de tarefa</span>
      </div><p></p>
    `;
    executeCommand('insertHTML', checkHtml);
  };

  // Upload de imagem da anotação
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const formData = new FormData();
      formData.append('image', file);

      const res = await fetch('/api/notes/upload-image', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (data.success && data.imageUrl) {
        const imgHtml = `<p><img src="${data.imageUrl}" alt="Imagem da Nota" style="max-width:100%; height:auto; border-radius:8px; margin:12px 0; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);" /></p><p><br></p>`;
        executeCommand('insertHTML', imgHtml);
        triggerToast('Imagem inserida com sucesso!', 'success');
      } else {
        triggerToast(data.error || 'Erro ao enviar imagem', 'error');
      }
    } catch (err: any) {
      console.error('Erro no upload:', err);
      triggerToast('Falha no upload da imagem', 'error');
    } finally {
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  // Criar nova anotação
  const handleCreateNote = async () => {
    try {
      setIsSaving(true);
      const newNotePayload = {
        title: 'Nova Anotação',
        content: '<p>Comece a escrever sua anotação aqui...</p>',
        author_id: user.id,
        author_name: user.name,
        visibility: 'public' as NoteVisibility,
        allow_edit: true,
        is_pinned: false,
        category: categoryFilter !== 'Todas' ? categoryFilter : 'Geral',
        color: '#3b82f6'
      };

      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newNotePayload)
      });

      const data = await res.json();
      if (data.success && data.note) {
        setNotes(prev => [data.note, ...prev]);
        setSelectedNote(data.note);
        setHasUnsavedChanges(false);
        setMobileView('editor');
        triggerToast('Anotação criada com sucesso!', 'success');
      } else {
        triggerToast(data.error || 'Erro ao criar anotação', 'error');
      }
    } catch (err: any) {
      console.error('Erro ao criar nota:', err);
      triggerToast('Falha ao criar anotação', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Salvar alterações na anotação selecionada
  const handleSaveNote = async (updatedFields?: Partial<Note>) => {
    if (!selectedNote) return;

    try {
      setIsSaving(true);
      const contentHtml = editorRef.current ? editorRef.current.innerHTML : selectedNote.content;

      const payload = {
        title: updatedFields?.title !== undefined ? updatedFields.title : selectedNote.title,
        content: updatedFields?.content !== undefined ? updatedFields.content : contentHtml,
        visibility: updatedFields?.visibility !== undefined ? updatedFields.visibility : selectedNote.visibility,
        allow_edit: updatedFields?.allow_edit !== undefined ? updatedFields.allow_edit : selectedNote.allow_edit,
        is_pinned: updatedFields?.is_pinned !== undefined ? updatedFields.is_pinned : selectedNote.is_pinned,
        category: updatedFields?.category !== undefined ? updatedFields.category : selectedNote.category,
        color: updatedFields?.color !== undefined ? updatedFields.color : selectedNote.color,
        userId: user.id,
        userName: user.name,
        userRole: user.role
      };

      const res = await fetch(`/api/notes/${selectedNote.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success && data.note) {
        setSelectedNote(data.note);
        setNotes(prev => prev.map(n => n.id === data.note.id ? data.note : n));
        setHasUnsavedChanges(false);
        triggerToast('Anotação salva!', 'success');
      } else {
        triggerToast(data.error || 'Erro ao salvar alterações', 'error');
      }
    } catch (err: any) {
      console.error('Erro ao salvar nota:', err);
      triggerToast('Falha ao salvar anotação', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Excluir anotação
  const handleDeleteNote = async () => {
    if (!selectedNote) return;

    try {
      setIsSaving(true);
      const res = await fetch(`/api/notes/${selectedNote.id}?userId=${user.id}&userRole=${user.role}`, {
        method: 'DELETE'
      });
      const data = await res.json();

      if (data.success) {
        setNotes(prev => prev.filter(n => n.id !== selectedNote.id));
        const remaining = notes.filter(n => n.id !== selectedNote.id);
        setSelectedNote(remaining.length > 0 ? remaining[0] : null);
        setShowDeleteModal(false);
        setMobileView('list');
        triggerToast('Anotação excluída!', 'success');
      } else {
        triggerToast(data.error || 'Erro ao excluir anotação', 'error');
      }
    } catch (err: any) {
      console.error('Erro ao excluir:', err);
      triggerToast('Falha ao excluir anotação', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Duplicar anotação
  const handleDuplicateNote = async () => {
    if (!selectedNote) return;
    try {
      setIsSaving(true);
      const duplicatePayload = {
        title: `${selectedNote.title} (Cópia)`,
        content: editorRef.current ? editorRef.current.innerHTML : selectedNote.content,
        author_id: user.id,
        author_name: user.name,
        visibility: 'private' as NoteVisibility,
        allow_edit: true,
        is_pinned: false,
        category: selectedNote.category,
        color: selectedNote.color
      };

      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(duplicatePayload)
      });
      const data = await res.json();

      if (data.success && data.note) {
        setNotes(prev => [data.note, ...prev]);
        setSelectedNote(data.note);
        setHasUnsavedChanges(false);
        triggerToast('Nota duplicada como privada!', 'success');
      }
    } catch (err) {
      triggerToast('Erro ao duplicar nota', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Imprimir / Exportar nota
  const handlePrintNote = () => {
    if (!selectedNote || !editorRef.current) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const contentHtml = editorRef.current.innerHTML;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${selectedNote.title} - Bela Farma</title>
          <meta charset="utf-8" />
          <style>
            body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; padding: 40px; color: #0f172a; line-height: 1.6; }
            h1 { font-size: 24px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 16px; }
            .meta { font-size: 12px; color: #64748b; margin-bottom: 24px; }
            table { width: 100%; border-collapse: collapse; margin: 16px 0; }
            th, td { border: 1px solid #cbd5e1; padding: 8px 12px; }
            th { background: #f1f5f9; }
            img { max-width: 100%; height: auto; }
            blockquote { border-left: 4px solid #94a3b8; padding-left: 16px; color: #475569; font-style: italic; }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <h1>${selectedNote.title}</h1>
          <div class="meta">
            <strong>Autor:</strong> ${selectedNote.author_name} | 
            <strong>Categoria:</strong> ${selectedNote.category} | 
            <strong>Atualizado em:</strong> ${new Date(selectedNote.updated_at).toLocaleString('pt-BR')}
          </div>
          <div class="content">
            ${contentHtml}
          </div>
          <script>
            window.onload = () => { window.print(); window.close(); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Permissão de edição da nota atual
  const canEditSelectedNote = Boolean(
    selectedNote && (
      selectedNote.author_id === user.id ||
      isAdmin ||
      selectedNote.allow_edit
    )
  );

  // Filtragem de notas na lista
  const filteredNotes = notes.filter(n => {
    if (visibilityTab === 'mine' && n.author_id !== user.id) return false;
    if (visibilityTab === 'public' && n.visibility !== 'public') return false;
    if (visibilityTab === 'pinned' && !n.is_pinned) return false;
    return true;
  });

  const getVisibilityIcon = (visibility: NoteVisibility) => {
    switch (visibility) {
      case 'private':
        return <Lock className="w-3.5 h-3.5 text-amber-500" title="Privada (apenas você)" />;
      case 'admin':
        return <Shield className="w-3.5 h-3.5 text-purple-500" title="Apenas Administradores" />;
      case 'public':
      default:
        return <Globe className="w-3.5 h-3.5 text-emerald-500" title="Pública para todos" />;
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] bg-slate-50 dark:bg-slate-950 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm">
      {/* TOAST FLUTUANTE */}
      {showToast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl border text-sm font-semibold transition-all animate-in fade-in slide-in-from-bottom-5 ${
          showToast.type === 'success' ? 'bg-emerald-600 text-white border-emerald-500' :
          showToast.type === 'error' ? 'bg-red-600 text-white border-red-500' :
          'bg-blue-600 text-white border-blue-500'
        }`}>
          {showToast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          <span>{showToast.message}</span>
        </div>
      )}

      {/* CABEÇALHO DO MÓDULO */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-red-600 text-white rounded-xl shadow-md shadow-red-600/20">
            <NotebookPen className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Bloco de Notas</h1>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Documentação, anotações livres e procedimentos internos</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Alternador Mobile */}
          <div className="flex md:hidden bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setMobileView('list')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                mobileView === 'list' ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white' : 'text-slate-500'
              }`}
            >
              Lista ({filteredNotes.length})
            </button>
            <button
              onClick={() => setMobileView('editor')}
              disabled={!selectedNote}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                mobileView === 'editor' ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white' : 'text-slate-500'
              }`}
            >
              Editor
            </button>
          </div>

          <button
            onClick={handleCreateNote}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold text-sm rounded-xl shadow-lg shadow-red-600/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Nota</span>
          </button>
        </div>
      </div>

      {/* CORPO PRINCIPAL (SPLIT: LISTA LATERAL + EDITOR) */}
      <div className="flex-1 flex overflow-hidden">
        {/* LISTA LATERAL DE ANOTAÇÕES */}
        <div className={`w-full md:w-80 lg:w-96 flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 ${
          mobileView === 'editor' ? 'hidden md:flex' : 'flex'
        }`}>
          {/* BUSCA E FILTROS */}
          <div className="p-4 space-y-3 border-b border-slate-200 dark:border-slate-800">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Buscar em anotações..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border-none rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-red-500 outline-none transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* ABAS DE VISIBILIDADE */}
            <div className="flex p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-bold">
              <button
                onClick={() => setVisibilityTab('all')}
                className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
                  visibilityTab === 'all' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Todas
              </button>
              <button
                onClick={() => setVisibilityTab('mine')}
                className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
                  visibilityTab === 'mine' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Minhas
              </button>
              <button
                onClick={() => setVisibilityTab('public')}
                className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
                  visibilityTab === 'public' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Públicas
              </button>
              <button
                onClick={() => setVisibilityTab('pinned')}
                className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
                  visibilityTab === 'pinned' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                📌 Fixadas
              </button>
            </div>

            {/* SELETOR DE CATEGORIA */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar text-xs font-semibold">
              {['Todas', ...DEFAULT_CATEGORIES].map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-2.5 py-1 rounded-lg shrink-0 transition-all cursor-pointer ${
                    categoryFilter === cat
                      ? 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* LISTA DE CARDS DE NOTAS */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
            {loading ? (
              <div className="p-8 text-center text-slate-400 text-sm">Carregando anotações...</div>
            ) : filteredNotes.length === 0 ? (
              <div className="p-8 text-center flex flex-col items-center gap-2 text-slate-400">
                <NotebookPen className="w-10 h-10 stroke-1 text-slate-300 dark:text-slate-700" />
                <p className="text-sm font-medium">Nenhuma anotação encontrada</p>
                <button
                  onClick={handleCreateNote}
                  className="mt-2 text-xs font-bold text-red-600 hover:underline cursor-pointer"
                >
                  + Criar primeira anotação
                </button>
              </div>
            ) : (
              filteredNotes.map(note => {
                const isSelected = selectedNote?.id === note.id;
                const dateFormatted = new Date(note.updated_at).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit'
                });

                const previewText = note.content
                  ? note.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
                  : 'Sem conteúdo adicional...';

                return (
                  <div
                    key={note.id}
                    onClick={() => {
                      setSelectedNote(note);
                      setMobileView('editor');
                    }}
                    className={`group relative p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-red-50/70 dark:bg-red-950/20 border-red-300 dark:border-red-900 shadow-sm'
                        : 'bg-white dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-sm'
                    }`}
                  >
                    <div
                      className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full"
                      style={{ backgroundColor: note.color || '#3b82f6' }}
                    />

                    <div className="flex items-start justify-between gap-2 pl-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white line-clamp-1 flex-1">
                        {note.title || 'Sem Título'}
                      </h3>
                      <div className="flex items-center gap-1 shrink-0">
                        {note.is_pinned && (
                          <Pin className="w-3.5 h-3.5 text-red-600 fill-red-600" />
                        )}
                        {getVisibilityIcon(note.visibility)}
                      </div>
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1.5 pl-2 leading-relaxed font-normal">
                      {previewText}
                    </p>

                    <div className="flex items-center justify-between gap-2 mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80 pl-2 text-[11px] text-slate-400">
                      <span className="font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 truncate max-w-[110px]">
                        {note.category}
                      </span>
                      <div className="flex items-center gap-1 font-medium">
                        <Clock className="w-3 h-3" />
                        <span>{dateFormatted}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* PAINEL PRINCIPAL / EDITOR ESTILO WORD */}
        <div className={`flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden ${
          mobileView === 'list' ? 'hidden md:flex' : 'flex'
        }`}>
          {selectedNote ? (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              {/* BARRA SUPERIOR DA NOTA: TÍTULO, PRIVACIDADE, AÇÕES */}
              <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                    <button
                      onClick={() => setMobileView('list')}
                      className="p-1.5 md:hidden text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <input
                      type="text"
                      value={selectedNote.title}
                      disabled={!canEditSelectedNote}
                      onChange={e => {
                        setSelectedNote({ ...selectedNote, title: e.target.value });
                        setHasUnsavedChanges(true);
                      }}
                      onBlur={() => handleSaveNote({ title: selectedNote.title })}
                      placeholder="Título da anotação..."
                      className="text-lg font-black text-slate-900 dark:text-white bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-red-500 outline-none w-full px-1 py-0.5 transition-all"
                    />
                  </div>

                  {/* AÇÕES DA NOTA */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Status de salvamento */}
                    <div className="text-xs font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                      {isSaving ? (
                        <span className="text-amber-600 flex items-center gap-1"><Clock className="w-3.5 h-3.5 animate-spin" /> Salvando...</span>
                      ) : hasUnsavedChanges ? (
                        <span className="text-amber-500 font-bold">● Alterações não salvas</span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Salvo</span>
                      )}
                    </div>

                    {/* Botão Fixar */}
                    <button
                      onClick={() => handleSaveNote({ is_pinned: !selectedNote.is_pinned })}
                      title={selectedNote.is_pinned ? 'Desafixar nota' : 'Fixar nota no topo'}
                      className={`p-2 rounded-xl border transition-all cursor-pointer ${
                        selectedNote.is_pinned
                          ? 'bg-red-50 dark:bg-red-950/40 border-red-200 text-red-600'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      {selectedNote.is_pinned ? <Pin className="w-4 h-4 fill-red-600" /> : <PinOff className="w-4 h-4" />}
                    </button>

                    {/* Botão Duplicar */}
                    <button
                      onClick={handleDuplicateNote}
                      title="Duplicar como cópia privada"
                      className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition-all cursor-pointer"
                    >
                      <Copy className="w-4 h-4" />
                    </button>

                    {/* Botão Imprimir/Exportar */}
                    <button
                      onClick={handlePrintNote}
                      title="Imprimir / Exportar em PDF"
                      className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition-all cursor-pointer"
                    >
                      <Printer className="w-4 h-4" />
                    </button>

                    {/* Botão Salvar manual */}
                    <button
                      onClick={() => handleSaveNote()}
                      disabled={isSaving || !canEditSelectedNote}
                      className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Salvar</span>
                    </button>

                    {/* Botão Excluir */}
                    {(selectedNote.author_id === user.id || isAdmin) && (
                      <button
                        onClick={() => setShowDeleteModal(true)}
                        title="Excluir anotação"
                        className="p-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 hover:bg-red-100 text-red-600 rounded-xl transition-all cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* METADADOS E CONTROLES DE VISIBILIDADE / CATEGORIA */}
                <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                  {/* Visibilidade */}
                  <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-xl">
                    {getVisibilityIcon(selectedNote.visibility)}
                    <span className="font-bold text-slate-700 dark:text-slate-300">Visibilidade:</span>
                    <select
                      value={selectedNote.visibility}
                      disabled={!isAdmin && selectedNote.author_id !== user.id}
                      onChange={e => handleSaveNote({ visibility: e.target.value as NoteVisibility })}
                      className="bg-transparent font-semibold text-slate-900 dark:text-white border-none outline-none cursor-pointer"
                    >
                      <option value="public" className="dark:bg-slate-800">🌐 Pública (Todos)</option>
                      <option value="admin" className="dark:bg-slate-800">🛡️ Apenas Administradores</option>
                      <option value="private" className="dark:bg-slate-800">🔒 Privada (Somente Eu)</option>
                    </select>
                  </div>

                  {/* Permissão de Edição */}
                  <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-xl">
                    <span className="font-bold text-slate-700 dark:text-slate-300">Edição:</span>
                    <select
                      value={selectedNote.allow_edit ? 'collab' : 'readonly'}
                      disabled={!isAdmin && selectedNote.author_id !== user.id}
                      onChange={e => handleSaveNote({ allow_edit: e.target.value === 'collab' })}
                      className="bg-transparent font-semibold text-slate-900 dark:text-white border-none outline-none cursor-pointer"
                    >
                      <option value="collab" className="dark:bg-slate-800">✏️ Colaborativa (outros podem editar)</option>
                      <option value="readonly" className="dark:bg-slate-800">👁️ Somente Leitura para terceiros</option>
                    </select>
                  </div>

                  {/* Categoria */}
                  <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-xl">
                    <Tag className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-bold text-slate-700 dark:text-slate-300">Categoria:</span>
                    <select
                      value={selectedNote.category}
                      disabled={!canEditSelectedNote}
                      onChange={e => handleSaveNote({ category: e.target.value })}
                      className="bg-transparent font-semibold text-slate-900 dark:text-white border-none outline-none cursor-pointer"
                    >
                      {DEFAULT_CATEGORIES.map(cat => (
                        <option key={cat} value={cat} className="dark:bg-slate-800">{cat}</option>
                      ))}
                    </select>
                  </div>

                  {/* Cor do Card */}
                  <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-xl">
                    <Palette className="w-3.5 h-3.5 text-slate-400" />
                    <div className="flex items-center gap-1">
                      {COLOR_PALETTES.map(p => (
                        <button
                          key={p.value}
                          onClick={() => handleSaveNote({ color: p.value })}
                          title={p.name}
                          className={`w-3.5 h-3.5 rounded-full transition-transform cursor-pointer ${p.bgClass} ${
                            selectedNote.color === p.value ? 'ring-2 ring-slate-900 dark:ring-white scale-110' : 'opacity-70 hover:opacity-100'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Info do Autor */}
                  <div className="ml-auto text-[11px] text-slate-400 flex items-center gap-2">
                    <span>Autor: <strong>{selectedNote.author_name}</strong></span>
                    <span>•</span>
                    <span>Atualizado: <strong>{new Date(selectedNote.updated_at).toLocaleString('pt-BR')}</strong></span>
                  </div>
                </div>
              </div>

              {/* BARRA DE FERRAMENTAS DO EDITOR ESTILO WORD */}
              {canEditSelectedNote ? (
                <div className="px-4 py-2 bg-slate-100 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-1 text-slate-700 dark:text-slate-300">
                  {/* Desfazer / Refazer */}
                  <button
                    onClick={() => executeCommand('undo')}
                    title="Desfazer (Ctrl+Z)"
                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    <Undo className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => executeCommand('redo')}
                    title="Refazer (Ctrl+Y)"
                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    <Redo className="w-4 h-4" />
                  </button>

                  <div className="w-[1px] h-5 bg-slate-300 dark:bg-slate-700 mx-1" />

                  {/* Tipos de Cabeçalho / Estilo */}
                  <select
                    onChange={e => {
                      if (e.target.value === 'p') executeCommand('formatBlock', '<p>');
                      else if (e.target.value) executeCommand('formatBlock', `<${e.target.value}>`);
                    }}
                    defaultValue="p"
                    className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold outline-none cursor-pointer"
                  >
                    <option value="p">Texto Normal</option>
                    <option value="h1">Título 1 (H1)</option>
                    <option value="h2">Título 2 (H2)</option>
                    <option value="h3">Título 3 (H3)</option>
                  </select>

                  {/* Tamanho da Fonte */}
                  <select
                    onChange={e => executeCommand('fontSize', e.target.value)}
                    defaultValue="3"
                    className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold outline-none cursor-pointer"
                  >
                    <option value="1">Pequeno (10pt)</option>
                    <option value="2">Menor (12pt)</option>
                    <option value="3">Normal (14pt)</option>
                    <option value="4">Médio (16pt)</option>
                    <option value="5">Grande (18pt)</option>
                    <option value="6">Muito Grande (24pt)</option>
                  </select>

                  <div className="w-[1px] h-5 bg-slate-300 dark:bg-slate-700 mx-1" />

                  {/* Formatações Básicas */}
                  <button
                    onClick={() => executeCommand('bold')}
                    title="Negrito (Ctrl+B)"
                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg font-bold cursor-pointer"
                  >
                    <Bold className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => executeCommand('italic')}
                    title="Itálico (Ctrl+I)"
                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg italic cursor-pointer"
                  >
                    <Italic className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => executeCommand('underline')}
                    title="Sublinhado (Ctrl+U)"
                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg underline cursor-pointer"
                  >
                    <Underline className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => executeCommand('strikeThrough')}
                    title="Tachado / Riscado"
                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    <Strikethrough className="w-4 h-4" />
                  </button>

                  <div className="w-[1px] h-5 bg-slate-300 dark:bg-slate-700 mx-1" />

                  {/* Cor do Texto */}
                  <div className="flex items-center gap-1 px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
                    <span className="text-[11px] font-black underline" style={{ color: fontColor }}>A</span>
                    <input
                      type="color"
                      value={fontColor}
                      onChange={e => {
                        setFontColor(e.target.value);
                        executeCommand('foreColor', e.target.value);
                      }}
                      title="Cor do Texto"
                      className="w-4 h-4 cursor-pointer border-none bg-transparent"
                    />
                  </div>

                  {/* Cor de Realce (Marca-texto) */}
                  <div className="flex items-center gap-1 px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
                    <span className="text-[10px] font-black px-1 rounded" style={{ backgroundColor: highlightColor, color: '#000' }}>Marcador</span>
                    <input
                      type="color"
                      value={highlightColor}
                      onChange={e => {
                        setHighlightColor(e.target.value);
                        executeCommand('hiliteColor', e.target.value);
                      }}
                      title="Cor do Marca-Texto"
                      className="w-4 h-4 cursor-pointer border-none bg-transparent"
                    />
                  </div>

                  <div className="w-[1px] h-5 bg-slate-300 dark:bg-slate-700 mx-1" />

                  {/* Alinhamentos */}
                  <button
                    onClick={() => executeCommand('justifyLeft')}
                    title="Alinhar à Esquerda"
                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    <AlignLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => executeCommand('justifyCenter')}
                    title="Centralizar"
                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    <AlignCenter className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => executeCommand('justifyRight')}
                    title="Alinhar à Direita"
                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    <AlignRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => executeCommand('justifyFull')}
                    title="Justificar"
                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    <AlignJustify className="w-4 h-4" />
                  </button>

                  <div className="w-[1px] h-5 bg-slate-300 dark:bg-slate-700 mx-1" />

                  {/* Listas & Checklist */}
                  <button
                    onClick={() => executeCommand('insertUnorderedList')}
                    title="Lista com Marcadores"
                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    <List className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => executeCommand('insertOrderedList')}
                    title="Lista Numerada"
                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    <ListOrdered className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleInsertChecklist}
                    title="Inserir Caixa de Tarefa / Checklist"
                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-red-600 dark:text-red-400 cursor-pointer"
                  >
                    <CheckSquare className="w-4 h-4" />
                  </button>

                  <div className="w-[1px] h-5 bg-slate-300 dark:bg-slate-700 mx-1" />

                  {/* Inserção de Tabela */}
                  <button
                    onClick={() => setShowTableModal(true)}
                    title="Inserir Tabela"
                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    <TableIcon className="w-4 h-4" />
                  </button>

                  {/* Inserção de Link */}
                  <button
                    onClick={() => setShowLinkModal(true)}
                    title="Inserir Link"
                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    <LinkIcon className="w-4 h-4" />
                  </button>

                  {/* Imagem */}
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    title="Enviar Imagem do Computador"
                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    <ImageIcon className="w-4 h-4" />
                  </button>
                  <input
                    type="file"
                    ref={imageInputRef}
                    onChange={handleImageUpload}
                    accept="image/*"
                    className="hidden"
                  />

                  {/* Limpar Formatação */}
                  <button
                    onClick={() => executeCommand('removeFormat')}
                    title="Limpar Formatação"
                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <Eraser className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900/50 flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
                  <Lock className="w-4 h-4" />
                  <span>Modo Somente Leitura. Esta anotação foi bloqueada para edição pelo autor.</span>
                </div>
              )}

              {/* ÁREA DO DOCUMENTO (FOLHA ESTILO WORD) */}
              <div className="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center custom-scrollbar">
                <div className="w-full max-w-4xl min-h-[600px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg p-6 md:p-12 transition-all">
                  <div
                    ref={editorRef}
                    contentEditable={canEditSelectedNote}
                    onInput={handleEditorInput}
                    onBlur={() => handleSaveNote()}
                    className="outline-none min-h-[500px] text-slate-800 dark:text-slate-200 leading-relaxed text-sm md:text-base prose dark:prose-invert max-w-none focus:ring-0"
                    style={{ minHeight: '500px' }}
                  />
                </div>
              </div>

              {/* BARRA DE STATUS INFERIOR */}
              <div className="px-6 py-2 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400 font-medium">
                <div className="flex items-center gap-4">
                  <span>{wordCount} palavras</span>
                  <span>{charCount} caracteres</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>Bela Farma Bloco de Notas</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
              <div className="p-4 bg-slate-100 dark:bg-slate-900 rounded-2xl mb-3">
                <NotebookPen className="w-12 h-12 text-slate-400" />
              </div>
              <h2 className="text-lg font-bold text-slate-700 dark:text-slate-300">Nenhuma anotação selecionada</h2>
              <p className="text-xs max-w-sm mt-1 text-slate-500">Selecione uma nota na lista lateral ou clique no botão abaixo para criar um novo documento.</p>
              <button
                onClick={handleCreateNote}
                className="mt-4 flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-red-600/20 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Nova Anotação</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      {showDeleteModal && selectedNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-3 bg-red-100 dark:bg-red-950/50 rounded-xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">Excluir Anotação?</h3>
                <p className="text-xs text-slate-500">Esta ação não poderá ser desfeita.</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300">
              Tem certeza de que deseja remover a anotação <strong>"{selectedNote.title}"</strong>?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteNote}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-red-600/20 transition-all cursor-pointer"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE INSERÇÃO DE TABELA */}
      {showTableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <TableIcon className="w-5 h-5 text-red-600" />
                <span>Inserir Tabela</span>
              </h3>
              <button onClick={() => setShowTableModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Linhas:</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={tableRows}
                  onChange={e => setTableRows(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Colunas:</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={tableCols}
                  onChange={e => setTableCols(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowTableModal(false)}
                className="px-3 py-1.5 text-xs font-bold text-slate-500 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleInsertTable}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Inserir Tabela
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE INSERÇÃO DE LINK */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <LinkIcon className="w-5 h-5 text-red-600" />
                <span>Inserir Link</span>
              </h3>
              <button onClick={() => setShowLinkModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">URL do Link:</label>
                <input
                  type="text"
                  placeholder="https://exemplo.com.br"
                  value={linkUrl}
                  onChange={e => setLinkUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-sm text-slate-900 dark:text-white outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Texto a Exibir (Opcional):</label>
                <input
                  type="text"
                  placeholder="Clique aqui..."
                  value={linkText}
                  onChange={e => setLinkText(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-sm text-slate-900 dark:text-white outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowLinkModal(false)}
                className="px-3 py-1.5 text-xs font-bold text-slate-500 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleInsertLink}
                disabled={!linkUrl.trim()}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl disabled:opacity-50 cursor-pointer"
              >
                Inserir Link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
