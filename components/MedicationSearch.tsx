
import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Sparkles, Loader2, Info, 
  Baby, User, Pill, Activity, X, ChevronRight,
  ShieldAlert, ClipboardCheck, AlertTriangle,
  Zap, RefreshCw, Cpu
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import { MedicationInfo } from '../types';

// --- LocalStorage Cache Helpers ---
const CACHE_KEY = 'belafarma_med_cache';

const getCachedMedication = (medName: string): MedicationInfo | null => {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    return cache[medName.toLowerCase()] || null;
  } catch {
    return null;
  }
};

const setCachedMedication = (medName: string, data: MedicationInfo) => {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    cache[medName.toLowerCase()] = data;
    // Opcional: Limitar o tamanho do cache para não lotar o localStorage
    const keys = Object.keys(cache);
    if (keys.length > 50) {
      delete cache[keys[0]]; // Remove o mais antigo
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.error("Failed to write to medication cache", e);
  }
};


export const MedicationSearch: React.FC = () => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedMed, setSelectedMed] = useState<MedicationInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [engineStatus, setEngineStatus] = useState<'primary' | 'fallback' | 'error'>('primary');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Função auxiliar para chamadas com Fallback
  const callAIWithFallback = async (prompt: string, schema: any, mimeType: string = "application/json") => {
    // Instantiate GoogleGenAI right before the API call to ensure fresh configuration
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const models = ['gemini-3-flash-preview', 'gemini-flash-lite-latest'];
    
    for (let i = 0; i < models.length; i++) {
      try {
        const response = await ai.models.generateContent({
          model: models[i],
          contents: prompt,
          config: {
            responseMimeType: mimeType,
            thinkingConfig: { thinkingBudget: 0 },
            responseSchema: schema
          }
        });
        
        // Se chegou aqui, funcionou. Define o status do motor.
        setEngineStatus(i === 0 ? 'primary' : 'fallback');
        return response.text;
      } catch (err: any) {
        console.warn(`Erro no modelo ${models[i]}:`, err.message);
        // Se for o último modelo da lista, lança o erro
        if (i === models.length - 1) {
          setEngineStatus('error');
          throw err;
        }
        // Caso contrário, continua para o próximo loop (fallback)
      }
    }
  };

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (query.length < 3 || selectedMed || isLoading) {
        setSuggestions([]);
        return;
      }

      setIsSearching(true);
      setErrorMessage(null); // Limpa o erro ao digitar
      try {
        const prompt = `Sugira 5 nomes de medicamentos que começam ou soam parecidos com: "${query}". Retorne apenas uma lista JSON de strings.`;
        const schema = {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        };
        
        const result = await callAIWithFallback(prompt, schema);
        const data = JSON.parse(result || '[]');
        setSuggestions(data);
      } catch (err) {
        console.error("Erro fatal nas sugestões:", err);
        setErrorMessage("API de sugestões indisponível.");
      } finally {
        setIsSearching(false);
      }
    };

    const timeoutId = setTimeout(fetchSuggestions, 500);
    return () => clearTimeout(timeoutId);
  }, [query, selectedMed, isLoading]);

  const handleSelectMed = async (medName: string) => {
    if (!medName || medName.length < 3) return;
    
    setQuery(medName);
    setSuggestions([]);
    setErrorMessage(null);

    const cachedMed = getCachedMedication(medName);
    if (cachedMed) {
      setSelectedMed(cachedMed);
      setEngineStatus('primary'); // Reset visual
      return;
    }

    setIsLoading(true);
    setSelectedMed(null);

    try {
      const prompt = `Forneça informações técnicas detalhadas para o medicamento: "${medName}". 
      Destaque claramente o Princípio Ativo (DCB/DCI).
      Inclua apresentações comuns. 
      Se o medicamento for Isento de Prescrição (MIP), o campo required deve ser false e a color deve ser "Nenhuma".`;
      
      const schema = {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          activeIngredient: { type: Type.STRING },
          indication: { type: Type.STRING },
          presentations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                adult: { type: Type.STRING },
                pediatric: { type: Type.STRING }
              },
              required: ["label", "adult", "pediatric"]
            }
          },
          prescriptionRequirement: {
            type: Type.OBJECT,
            properties: {
              required: { type: Type.BOOLEAN },
              color: { type: Type.STRING },
              description: { type: Type.STRING }
            },
            required: ["required", "color", "description"]
          },
          restrictions: { type: Type.ARRAY, items: { type: Type.STRING } },
          contraindications: { type: Type.STRING }
        },
        required: ["name", "activeIngredient", "indication", "presentations", "prescriptionRequirement", "restrictions", "contraindications"]
      };

      const result = await callAIWithFallback(prompt, schema);
      const data = JSON.parse(result || '{}') as MedicationInfo;
      setCachedMedication(medName, data);
      setSelectedMed(data);
    } catch (err) {
      console.error("Erro fatal nos detalhes:", err);
      setErrorMessage("O limite de consultas foi atingido. Tente novamente mais tarde.");
      setEngineStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    handleSelectMed(query);
  };

  const getPrescriptionStyles = (color: string) => {
    switch (color) {
      case 'Azul': return 'bg-blue-600 border-blue-400 text-white';
      case 'Amarela': return 'bg-yellow-400 border-yellow-200 text-slate-900';
      case 'Branca': return 'bg-white border-slate-300 text-slate-800';
      case 'Especial': return 'bg-slate-800 border-slate-600 text-white';
      default: return 'hidden';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-4xl mx-auto pb-20">
      <header className="text-center space-y-2 relative">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-full border border-red-100 mb-2">
          <Sparkles className="w-4 h-4" />
          <span className="text-[10px] font-black uppercase tracking-widest">Suporte à Dispensação</span>
        </div>
        
        {/* Status do Motor de IA */}
        <div className="absolute top-0 right-0 hidden md:flex items-center gap-2">
          {engineStatus === 'fallback' && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-600 border border-amber-100 rounded-lg animate-pulse">
              <RefreshCw className="w-3 h-3" />
              <span className="text-[8px] font-black uppercase">Motor de Backup Ativo</span>
            </div>
          )}
          {engineStatus === 'error' && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-600 border border-red-100 rounded-lg">
              <AlertTriangle className="w-3 h-3" />
              <span className="text-[8px] font-black uppercase">Erro de Cota</span>
            </div>
          )}
        </div>

        <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">Consulta Técnica</h1>
        <p className="text-slate-500 font-medium max-w-md mx-auto italic text-sm">Identifique apresentações, posologias e princípios ativos.</p>
      </header>

      <div className="relative">
        <form onSubmit={handleManualSearch} className="relative group z-30">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-300 group-focus-within:text-red-500 transition-colors" />
          <input 
            type="text"
            className="w-full pl-16 pr-12 py-6 bg-white border-2 border-slate-100 rounded-[2.5rem] shadow-xl shadow-slate-200/50 outline-none focus:border-red-500 transition-all font-bold text-lg placeholder:font-normal"
            placeholder="Digite o nome e aperte ENTER..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (selectedMed) setSelectedMed(null);
            }}
          />
          {isSearching && (
            <div className="absolute right-6 top-1/2 -translate-y-1/2">
              <Loader2 className="w-5 h-5 text-red-500 animate-spin" />
            </div>
          )}
        </form>

        {suggestions.length > 0 && !selectedMed && !isLoading && (
          <div className="absolute top-full left-0 w-full mt-2 bg-white rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden z-[100] animate-in slide-in-from-top-2 duration-300">
            {suggestions.map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectMed(s)}
                className="w-full px-6 py-4 text-left font-bold text-slate-700 hover:bg-red-50 hover:text-red-700 flex items-center justify-between group transition-all border-b border-slate-50 last:border-none"
              >
                <span>{s}</span>
                <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all text-red-400" />
              </button>
            ))}
          </div>
        )}
      </div>

      {errorMessage && !isLoading && (
        <div className="p-4 bg-red-50 rounded-2xl border border-red-100 text-center">
           <p className="text-sm font-bold text-red-600">{errorMessage}</p>
        </div>
      )}

      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-4 text-slate-400">
          <div className="relative">
             <div className="w-16 h-16 border-4 border-slate-100 border-t-red-500 rounded-full animate-spin"></div>
             <Pill className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-red-200" />
          </div>
          <p className="font-black uppercase tracking-widest text-xs animate-pulse">
            {engineStatus === 'fallback' ? 'Motor secundário processando...' : 'Sincronizando dados...'}
          </p>
        </div>
      ) : selectedMed && (
        <div className="animate-in zoom-in-95 duration-500 space-y-6 relative z-10">
          {selectedMed.prescriptionRequirement.required && selectedMed.prescriptionRequirement.color !== 'Nenhuma' && (
            <div className={`p-6 rounded-[2rem] border-2 shadow-lg flex items-center justify-between gap-4 ${getPrescriptionStyles(selectedMed.prescriptionRequirement.color)} animate-bounce-short`}>
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/20 rounded-2xl">
                  <ClipboardCheck className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest">Retenção Obrigatória</h3>
                  <p className="text-xl font-black">Receita {selectedMed.prescriptionRequirement.color}</p>
                </div>
              </div>
              <div className="hidden md:block text-right">
                <p className="text-xs font-bold opacity-80 uppercase leading-tight">{selectedMed.prescriptionRequirement.description}</p>
              </div>
            </div>
          )}

          <div className="bg-white rounded-[3rem] border border-slate-200 shadow-xl overflow-hidden">
            <div className="p-8 md:p-12 space-y-10">
              <div className="flex items-center justify-between gap-6 border-b border-slate-100 pb-8">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-red-600 rounded-3xl flex items-center justify-center shadow-lg shadow-red-200">
                    <Pill className="w-8 h-8 text-white" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">{selectedMed.name}</h2>
                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md border border-slate-200">
                        <Zap className="w-3 h-3 fill-slate-400" />
                        <span className="text-[10px] font-black uppercase tracking-tight">{selectedMed.activeIngredient}</span>
                      </div>
                    </div>
                    <p className="text-slate-500 font-bold text-sm pt-1">{selectedMed.indication}</p>
                  </div>
                </div>
                <button onClick={() => { setSelectedMed(null); setQuery(''); setEngineStatus('primary'); }} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                  <X className="w-8 h-8" />
                </button>
              </div>

              <div className="space-y-6">
                <h3 className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <Activity className="w-3.5 h-3.5" /> Apresentações e Posologia Sugerida
                </h3>
                
                <div className="grid grid-cols-1 gap-4">
                  {selectedMed.presentations.map((pres, i) => (
                    <div key={i} className="bg-slate-50 rounded-[2rem] border border-slate-100 p-6 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center border border-slate-200 shadow-sm">
                          <span className="text-xs font-black text-red-600">{i+1}</span>
                        </div>
                        <span className="font-black text-slate-800 uppercase tracking-tight">{pres.label}</span>
                      </div>
                      
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-[8px] font-black text-blue-500 uppercase tracking-widest">
                          <User className="w-3 h-3" /> Adulto
                        </div>
                        <p className="text-sm font-bold text-slate-700">{pres.adult}</p>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-[8px] font-black text-pink-500 uppercase tracking-widest">
                          <Baby className="w-3 h-3" /> Pediátrico
                        </div>
                        <p className="text-sm font-bold text-slate-700">{pres.pediatric}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-slate-100">
                <div className="space-y-4">
                   <h4 className="flex items-center gap-2 text-[10px] font-black text-red-600 uppercase tracking-widest">
                     <AlertTriangle className="w-3.5 h-3.5" /> Contraindicações
                   </h4>
                   <p className="text-sm font-bold text-slate-600 leading-relaxed">{selectedMed.contraindications}</p>
                </div>
                <div className="space-y-4">
                   <h4 className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                     <Info className="w-3.5 h-3.5" /> Alertas Adicionais
                   </h4>
                   <ul className="grid grid-cols-1 gap-2">
                     {selectedMed.restrictions.map((r, idx) => (
                       <li key={idx} className="text-[11px] font-bold text-slate-500 flex items-center gap-2">
                         <div className="w-1 h-1 bg-slate-300 rounded-full" /> {r}
                       </li>
                     ))}
                   </ul>
                </div>
              </div>

              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 text-center flex items-center justify-center gap-4">
                <p className="text-[9px] font-black text-amber-700 uppercase tracking-tighter">
                  Sempre confira a bula oficial. Ferramenta de auxílio à dispensação.
                </p>
                {engineStatus === 'fallback' && (
                  <div className="flex items-center gap-1 px-2 py-0.5 bg-amber-200 text-amber-800 rounded-md text-[7px] font-black uppercase">
                    <Cpu className="w-2.5 h-2.5" /> Backup Engine
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {!selectedMed && !isLoading && (
        <div className="py-20 text-center space-y-4 opacity-20">
          <Pill className="w-16 h-16 mx-auto text-slate-300" />
          <p className="font-black text-slate-400 uppercase tracking-[0.2em] text-sm italic">Consulte o acervo da farmácia</p>
        </div>
      )}
    </div>
  );
};
