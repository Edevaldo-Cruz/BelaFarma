import React, { useState, useEffect } from 'react';
import { FileText, Loader2, CheckCircle2 } from 'lucide-react';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

interface FileInfo {
  name: string;
  size: number;
  date: string;
}

interface FileSelectorProps {
  onSelect: (filenames: string[]) => void;
  selectedFiles: string[];
}

export default function FileSelector({ onSelect, selectedFiles }: FileSelectorProps) {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(false);

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
      console.error('Erro ao buscar arquivos no seletor:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleFile = (filename: string) => {
    if (selectedFiles.includes(filename)) {
      onSelect(selectedFiles.filter(f => f !== filename));
    } else {
      onSelect([...selectedFiles, filename]);
    }
  };

  if (loading) return (
    <div className="p-8 flex justify-center w-full">
      <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
    </div>
  );

  if (files.length === 0) return (
    <div className="p-8 text-center w-full bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-dashed border-slate-200">
      <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Nenhum relatório na central</p>
    </div>
  );

  return (
    <>
      {files.map((file, idx) => {
        const isSelected = selectedFiles.includes(file.name);
        return (
          <button
            key={idx}
            type="button"
            onClick={() => toggleFile(file.name)}
            className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left w-full ${
              isSelected 
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm' 
              : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-200'
            }`}
          >
            <div className={`p-2 rounded-xl ${isSelected ? 'bg-blue-500 text-white' : 'bg-slate-50 dark:bg-slate-800 text-slate-400'}`}>
              <FileText className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-slate-700 dark:text-slate-200 text-sm truncate" title={file.name}>{file.name}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                {new Date(file.date).toLocaleDateString('pt-BR')}
              </p>
            </div>
            {isSelected && (
              <CheckCircle2 className="w-5 h-5 text-blue-500" />
            )}
          </button>
        );
      })}
    </>
  );
}
