
import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Filter, Trash2, ClipboardList, 
  MessageCircle, Star, X, Save, User as UserIcon,
  Tag, AlertCircle, Loader2, Sparkles, FileDown
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import { ProductShortage, ProductType, User, UserRole } from '../types';

interface ProductShortagesProps {
  user: User;
  shortages: ProductShortage[];
  onAdd: (shortage: ProductShortage) => void;
  onDelete: (id: string) => void;
}

export const ProductShortages: React.FC<ProductShortagesProps> = ({ user, shortages, onAdd, onDelete }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [formData, setFormData] = useState({
    productName: '',
    type: ProductType.GENERICO,
    clientInquiry: false,
    notes: ''
  });

  // Estado para busca inteligente no formulário
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isSearchingSuggestions, setIsSearchingSuggestions] = useState(false);
  const [lastSelected, setLastSelected] = useState('');

  useEffect(() => {
    const fetchSuggestions = async () => {
      // Se a query for pequena, ou igual ao que acabamos de selecionar, para.
      if (formData.productName.length < 3 || formData.productName === lastSelected) {
        setSuggestions([]);
        return;
      }
      
      setIsSearchingSuggestions(true);
      // Instantiate GoogleGenAI right before the API call
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Sugira 3 nomes de medicamentos oficiais que começam com: "${formData.productName}". Retorne JSON array de strings.`,
          config: {
            responseMimeType: "application/json",
            responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } }
          }
        });
        setSuggestions(JSON.parse(response.text || '[]'));
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearchingSuggestions(false);
      }
    };

    const timer = setTimeout(fetchSuggestions, 800);
    return () => clearTimeout(timer);
  }, [formData.productName, lastSelected]);

  const filteredShortages = shortages.filter(s => {
    const matchesSearch = s.productName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || s.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const exportToTxt = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR');
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const filterLabel = typeFilter === 'all' ? 'Todos os tipos' : typeFilter;
    const searchLabel = searchTerm ? `Busca: "${searchTerm}"` : 'Sem filtro de busca';

    const lines: string[] = [
      '================================================',
      `  LISTA DE FALTAS - COTAÇÃO`,
      `  Gerado em: ${dateStr} às ${timeStr}`,
      `  Filtros: ${filterLabel} | ${searchLabel}`,
      `  Total de itens: ${filteredShortages.length}`,
      '================================================',
      '',
    ];

    // Urgentes primeiro
    const urgent = filteredShortages.filter(s => s.clientInquiry);
    const normal = filteredShortages.filter(s => !s.clientInquiry);

    if (urgent.length > 0) {
      lines.push('⚠  URGENTE (Cliente Aguardando):');
      lines.push('------------------------------------------------');
      urgent.forEach((s, i) => {
        lines.push(`  ${i + 1}. ${s.productName.toUpperCase()} [${s.type}]`);
        if (s.notes) lines.push(`     Obs: ${s.notes}`);
      });
      lines.push('');
    }

    if (normal.length > 0) {
      lines.push('   ITENS PARA COTAÇÃO:');
      lines.push('------------------------------------------------');
      normal.forEach((s, i) => {
        lines.push(`  ${urgent.length + i + 1}. ${s.productName.toUpperCase()} [${s.type}]`);
        if (s.notes) lines.push(`     Obs: ${s.notes}`);
      });
      lines.push('');
    }

    lines.push('================================================');
    lines.push('  Bela Farma');
    lines.push('================================================');

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `faltas-cotacao-${now.toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.productName) return;

    onAdd({
      id: Math.random().toString(36).substr(2, 9),
      ...formData,
      createdAt: new Date().toISOString(),
      userName: user.name
    });

    setFormData({ productName: '', type: ProductType.GENERICO, clientInquiry: false, notes: '' });
    setLastSelected('');
    setIsModalOpen(false);
  };

  const getTypeColor = (type: ProductType) => {
    switch (type) {
      case ProductType.GENERICO: return 'bg-blue-100 text-blue-700';
      case ProductType.SIMILAR: return 'bg-purple-100 text-purple-700';
      case ProductType.PERFUMARIA: return 'bg-emerald-100 text-emerald-700';
      case ProductType.MARCA: return 'bg-amber-100 text-amber-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Lista de Faltas e Procura</h1>
          <p className="text-slate-500 font-medium">Controle de estoque e pedidos perdidos.</p>
        </div>
        <button 
          onClick={() => {
            setFormData({ productName: '', type: ProductType.GENERICO, clientInquiry: false, notes: '' });
            setLastSelected('');
            setIsModalOpen(true);
          }}
          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg active:scale-95"
        >
          <Plus className="w-5 h-5" /> Registrar Falta
        </button>
      </header>

      <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Buscar produto em falta..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-red-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="relative w-full md:w-56">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select 
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold appearance-none outline-none focus:ring-2 focus:ring-red-500"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">Todos os Tipos</option>
            {Object.values(ProductType).map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <button
          onClick={exportToTxt}
          disabled={filteredShortages.length === 0}
          title={`Exportar ${filteredShortages.length} item(s) para TXT`}
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          <FileDown className="w-4 h-4" />
          Exportar TXT ({filteredShortages.length})
        </button>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Produto / Item</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Procura de Cliente</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Registrado por</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredShortages.map((s) => (
                <tr key={s.id} className="hover:bg-red-50/20 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-black text-slate-900 uppercase tracking-tighter">{s.productName}</span>
                      {s.notes && (
                        <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1 mt-0.5">
                          <MessageCircle className="w-3 h-3" /> {s.notes}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${getTypeColor(s.type)}`}>
                      {s.type}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-center">
                      {s.clientInquiry ? (
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-600 rounded-full border border-amber-100 animate-pulse">
                          <Star className="w-3 h-3 fill-amber-600" />
                          <span className="text-[10px] font-black uppercase">Sim, Urgente</span>
                        </div>
                      ) : (
                        <span className="text-[10px] font-black text-slate-300 uppercase">Não</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-slate-700 uppercase">{s.userName}</span>
                      <span className="text-[9px] font-bold text-slate-400">{new Date(s.createdAt).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-center">
                      <button 
                        onClick={() => confirm('Remover este item da lista de faltas?') && onDelete(s.id)}
                        className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                      >
                        <Trash2 className="w-4.5 h-4.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredShortages.length === 0 && (
            <div className="py-12 text-center text-slate-400 italic font-bold text-sm">
              Nenhuma falta registrada.
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-red-50/50">
              <h2 className="text-xl font-black text-red-700 tracking-tight uppercase">Registrar Falta</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-red-700 transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="space-y-2 relative">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex justify-between">
                  Nome do Produto* 
                  {isSearchingSuggestions && <Loader2 className="w-3 h-3 animate-spin text-red-500" />}
                </label>
                <div className="relative">
                  <Tag className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input 
                    required autoFocus
                    type="text"
                    autoComplete="off"
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold"
                    placeholder="Inicie a digitação..."
                    value={formData.productName}
                    onChange={e => setFormData({...formData, productName: e.target.value})}
                  />
                </div>

                {suggestions.length > 0 && (
                  <div className="absolute top-full left-0 w-full bg-white shadow-2xl rounded-2xl border border-slate-100 z-[70] mt-1 overflow-hidden">
                    {suggestions.map((s, i) => (
                      <button 
                        key={i} 
                        type="button"
                        onClick={() => {
                          setFormData({...formData, productName: s});
                          setLastSelected(s);
                          setSuggestions([]);
                        }}
                        className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-red-50 hover:text-red-700 border-b border-slate-50 last:border-none flex items-center gap-2"
                      >
                        <Sparkles className="w-3 h-3 text-red-400" />
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Classificação do Produto*</label>
                <select 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold appearance-none"
                  value={formData.type}
                  onChange={e => setFormData({...formData, type: e.target.value as ProductType})}
                >
                  {Object.values(ProductType).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Procura de Cliente?</label>
                <button 
                  type="button"
                  onClick={() => setFormData({...formData, clientInquiry: !formData.clientInquiry})}
                  className={`w-full p-4 rounded-2xl border-2 flex items-center justify-center gap-3 transition-all ${
                    formData.clientInquiry 
                      ? 'border-amber-500 bg-amber-50 text-amber-700 shadow-inner' 
                      : 'border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200'
                  }`}
                >
                  <Star className={`w-5 h-5 ${formData.clientInquiry ? 'fill-amber-500' : ''}`} />
                  <span className="font-black text-xs uppercase">Sim, o cliente procurou na loja</span>
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Observações Adicionais</label>
                <textarea 
                  rows={2}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-medium resize-none"
                  placeholder="Ex: Cliente aguardando retorno, preço concorrente..."
                  value={formData.notes}
                  onChange={e => setFormData({...formData, notes: e.target.value})}
                />
              </div>

              <div className="pt-2">
                <button 
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 py-4 bg-red-600 text-white rounded-2xl font-black shadow-xl shadow-red-100 hover:bg-red-700 transition-all active:scale-[0.98] uppercase tracking-widest"
                >
                  <Save className="w-5 h-5" />
                  Salvar na Lista
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
