import React, { useState, useEffect, useRef } from 'react';
import { 
  UploadCloud, 
  FileText, 
  Trash2, 
  Loader2, 
  FileSearch,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { useToast } from './ToastContext';

const API_BASE = 'http://localhost:3001';

interface FileInfo {
  name: string;
  size: number;
  date: string;
  type: string;
}

export default function IsaFiles() {
  const { addToast } = useToast();
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/files`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setFiles(data);
      }
    } catch (err) {
      console.error('Erro ao buscar arquivos:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('relatorio', file);

    try {
      const res = await fetch(`${API_BASE}/api/files/upload`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        addToast('Arquivo enviado para a central!', 'success');
        fetchFiles();
      } else {
        throw new Error('Erro no upload');
      }
    } catch (err) {
      addToast('Erro ao enviar arquivo', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (filename: string) => {
    if (!confirm('Deseja excluir este arquivo da central?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/files/${filename}`, { method: 'DELETE' });
      if (res.ok) {
        addToast('Arquivo removido', 'success');
        fetchFiles();
      }
    } catch (err) {
      addToast('Erro ao remover arquivo', 'error');
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div>
            <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <UploadCloud className="w-6 h-6 text-blue-500" />
              Central de Arquivos
            </h2>
            <p className="text-sm text-slate-500 font-medium italic">Depósito compartilhado de relatórios para as IAs</p>
          </div>
          
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-6 py-3 bg-blue-600 text-white rounded-2xl text-sm font-bold shadow-lg hover:bg-blue-700 transition-all flex items-center gap-2 whitespace-nowrap"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
            {uploading ? 'Enviando...' : 'Subir Relatório Digifarma'}
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleUpload} 
            className="hidden" 
            accept=".csv,.pdf"
          />
        </div>

        {loading ? (
          <div className="py-20 flex justify-center">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        ) : files.length === 0 ? (
          <div className="border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-3xl p-20 text-center">
            <div className="h-16 w-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileSearch className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-slate-600 dark:text-slate-300 font-bold">Nenhum relatório na central</h3>
            <p className="text-slate-400 text-sm">Envie CSVs ou PDFs para que a Isa-Financeiro ou Isa-Compras possam analisá-los.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {files.map((file, idx) => (
              <div key={idx} className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 group hover:border-blue-300 transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-2 rounded-xl bg-white dark:bg-slate-700 shadow-sm ${file.type === 'application/pdf' ? 'text-red-500' : 'text-emerald-500'}`}>
                    <FileText className="w-5 h-5" />
                  </div>
                  <button 
                    onClick={() => handleDelete(file.name)}
                    className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <h4 className="font-bold text-slate-700 dark:text-slate-200 text-sm truncate mb-1" title={file.name}>{file.name}</h4>
                <div className="flex items-center justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <span>{formatSize(file.size)}</span>
                  <span>{new Date(file.date).toLocaleDateString('pt-BR')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-2xl border border-blue-100 dark:border-blue-900/30 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5" />
        <p className="text-xs text-blue-700 dark:text-blue-400 font-medium leading-relaxed">
          <strong>Dica da Isa:</strong> Arquivos nesta área ficam disponíveis para todos os agentes. Você não precisa enviar o mesmo relatório mais de uma vez.
        </p>
      </div>
    </div>
  );
}
