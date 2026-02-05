import React, { useState, useEffect } from 'react';
import { Database, AlertTriangle, RotateCcw, Clock, ShieldCheck, Download, Plus, RefreshCw, Server, Info, X } from 'lucide-react';
import { useToast } from './ToastContext';

interface BackupFile {
  name: string;
  size: number;
  date: string;
}

export const BackupManager: React.FC = () => {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<BackupFile | null>(null);
  const { addToast } = useToast();

  const fetchBackups = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/backups');
      if (response.ok) {
        const data = await response.json();
        setBackups(data);
      } else {
        throw new Error('Failed to fetch backups');
      }
    } catch (error) {
      console.error(error);
      addToast('Erro ao carregar lista de backups', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const handleCreateBackup = async () => {
    setIsCreating(true);
    try {
      const response = await fetch('/api/backups/create', { method: 'POST' });
      const data = await response.json();
      
      if (response.ok) {
        addToast('Backup solicitado com sucesso!', 'success');
        // Wait a bit for the file to be created before refreshing
        setTimeout(fetchBackups, 2000);
      } else {
        throw new Error(data.error || 'Failed to create backup');
      }
    } catch (error) {
      console.error(error);
      addToast('Erro ao criar backup', 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const initRestore = (backup: BackupFile) => {
    setSelectedBackup(backup);
  };

  const confirmRestore = async () => {
    if (!selectedBackup) return;

    setIsRestoring(true);
    try {
      const response = await fetch(`/api/backups/${selectedBackup.name}/restore`, { 
        method: 'POST' 
      });
      const data = await response.json();

      if (response.ok) {
        addToast('Sistema restaurado com sucesso! Atualizando...', 'success');
        // Close modal
        setSelectedBackup(null);
        // Reload page to ensure new data is fetched
        setTimeout(() => {
            window.location.reload();
        }, 1500);
      } else {
        throw new Error(data.error || 'Falha na restauração');
      }
    } catch (error) {
      console.error(error);
      addToast(error instanceof Error ? error.message : 'Erro ao restaurar backup', 'error');
    } finally {
      setIsRestoring(false);
    }
  };

  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  return (
    <>
      <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
              <ShieldCheck className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
              Backups do Sistema
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Gerencie pontos de restauração e segurança dos dados.
            </p>
          </div>
          
          <div className="flex items-center gap-2">
              <button 
                  onClick={fetchBackups}
                  className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all"
                  title="Atualizar lista"
              >
                  <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
              onClick={handleCreateBackup}
              disabled={isCreating}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-bold"
              >
              {isCreating ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                  <Plus className="w-4 h-4" />
              )}
              Criar Novo Backup
              </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Status Card */}
          <div className="lg:col-span-1 space-y-4">
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 dark:bg-indigo-900/20 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110" />
                  
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 relative z-10 flex items-center gap-2">
                      <Server className="w-5 h-5 text-indigo-600" />
                      Status do Servidor
                  </h3>
                  
                  <div className="space-y-4 relative z-10">
                      <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800">
                          <span className="text-sm text-slate-500">Agendamento Automático</span>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold border border-emerald-200">ATIVO</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800">
                          <span className="text-sm text-slate-500">Frequência</span>
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">12:00 e 23:00</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800">
                          <span className="text-sm text-slate-500">Retenção</span>
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">30 Dias</span>
                      </div>
                      <div className="flex justify-between items-center py-2">
                          <span className="text-sm text-slate-500">Total de Backups</span>
                          <span className="text-lg font-black text-indigo-600">{backups.length}</span>
                      </div>
                  </div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4">
                  <div className="flex gap-3">
                      <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="space-y-1">
                          <p className="text-xs font-bold text-amber-800 dark:text-amber-400 uppercase tracking-wide">Informação Importante</p>
                          <p className="text-sm text-amber-900 dark:text-amber-200 leading-relaxed">
                              A restauração de backup substituirá todos os dados atuais. Certifique-se de que os dados atuais estão salvos se necessário.
                          </p>
                      </div>
                  </div>
              </div>
          </div>

          {/* Backups List */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex justify-between items-center">
                  <h3 className="font-bold text-slate-700 dark:text-slate-200">Histórico de Arquivos</h3>
                  <span className="text-xs font-medium text-slate-400">Armazenamento Seguro</span>
              </div>
              
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[500px] overflow-y-auto">
                  {backups.length === 0 ? (
                      <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
                          <Database className="w-12 h-12 opacity-20" />
                          <p>Nenhum backup encontrado.</p>
                      </div>
                  ) : (
                      backups.map((backup, index) => (
                          <div key={backup.name} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-center justify-between group">
                              <div className="flex items-center gap-4">
                                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${index === 0 ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                                      <Database className="w-5 h-5" />
                                  </div>
                                  <div>
                                      <h4 className="font-semibold text-slate-900 dark:text-white text-sm">
                                          {new Date(backup.date).toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                      </h4>
                                      <div className="flex items-center gap-3 mt-1">
                                          <span className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                                              <Clock className="w-3 h-3" />
                                              {new Date(backup.date).toLocaleTimeString('pt-BR')}
                                          </span>
                                          <span className="text-xs text-slate-400">•</span>
                                          <span className="text-xs text-slate-500 font-mono">{formatBytes(backup.size)}</span>
                                      </div>
                                      <p className="text-[10px] text-slate-400 mt-1 font-mono hidden group-hover:block">{backup.name}</p>
                                  </div>
                              </div>

                              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button 
                                      onClick={() => initRestore(backup)}
                                      className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex items-center gap-2"
                                  >
                                      <RotateCcw className="w-3 h-3" />
                                      Restaurar
                                  </button>
                              </div>
                          </div>
                      ))
                  )}
              </div>
          </div>
        </div>
      </div>

      {/* Restore Confirmation Modal */}
      {selectedBackup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 flex items-center justify-center mb-4 mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>
              
              <h3 className="text-xl font-bold text-slate-900 dark:text-white text-center mb-2">
                Restaurar Backup?
              </h3>
              
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 mb-4 text-center">
                <p className="text-xs text-slate-500 uppercase font-bold tracking-wide mb-1">Backup Selecionado</p>
                <p className="font-mono text-sm text-slate-700 dark:text-slate-300 font-medium break-all">{selectedBackup.name}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {new Date(selectedBackup.date).toLocaleString('pt-BR')} • {formatBytes(selectedBackup.size)}
                </p>
              </div>

              <p className="text-slate-600 dark:text-slate-400 text-center text-sm leading-relaxed mb-6">
                <span className="font-bold text-red-600">ATENÇÃO:</span> Esta ação irá substituir TODOS os dados atuais pelos dados deste backup. Esta ação não pode ser desfeita. Você tem certeza que deseja continuar?
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedBackup(null)}
                  className="flex-1 py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl border border-slate-200 transition-all text-sm"
                  disabled={isRestoring}
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmRestore}
                  disabled={isRestoring}
                  className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl shadow-lg shadow-red-600/20 transition-all flex items-center justify-center gap-2 text-sm"
                >
                  {isRestoring ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Restaurando...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-4 h-4" />
                      Confirmar Restauração
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

