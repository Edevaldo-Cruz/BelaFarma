import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Building2,
  FileKey,
  Hash,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
  Lock,
  Save,
  FileText,
  Activity,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useToast } from '../ToastContext';

interface FiscalSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FiscalSettingsModal: React.FC<FiscalSettingsModalProps> = ({ isOpen, onClose }) => {
  const { addToast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Campos do formulário
  const [cnpj, setCnpj] = useState('47.378.578/0001-40');
  const [razaoSocial, setRazaoSocial] = useState('BELA FARMA SUL LTDA');
  const [nomeFantasia, setNomeFantasia] = useState('DROGARIA BELA FARMA');
  const [inscricaoEstadual, setInscricaoEstadual] = useState('0041234560089');
  const [logradouro, setLogradouro] = useState('RUA PREVIDENCIARIOS');
  const [numero, setNumero] = useState('100');
  const [bairro, setBairro] = useState('PREVIDENCIARIOS');
  const [municipio, setMunicipio] = useState('JUIZ DE FORA');
  const [codMunicipioIbge, setCodMunicipioIbge] = useState('3136702');
  const [uf, setUf] = useState('MG');
  const [cep, setCep] = useState('36033-000');
  const [regimeTributario, setRegimeTributario] = useState('1'); // 1=Simples Nacional
  const [ambiente, setAmbiente] = useState<'homologacao' | 'producao'>('homologacao');
  const [nfeSeries, setNfeSeries] = useState(1);
  const [nextNfeNumber, setNextNfeNumber] = useState(1);
  const [csc, setCsc] = useState('');
  const [idCsc, setIdCsc] = useState('000001');

  // Certificado Digital A1
  const [hasCertificate, setHasCertificate] = useState(false);
  const [certificatePfxBase64, setCertificatePfxBase64] = useState<string | null>(null);
  const [certificateFileName, setCertificateFileName] = useState('');
  const [certificatePassword, setCertificatePassword] = useState('');

  // Diagnóstico de Conexão SEFAZ
  const [isCheckingSefaz, setIsCheckingSefaz] = useState(false);
  const [sefazStatusResult, setSefazStatusResult] = useState<any>(null);

  const handleTestarSefaz = async () => {
    setIsCheckingSefaz(true);
    try {
      const res = await fetch('/api/erp/fiscal/status-sefaz');
      const data = await res.json();
      setSefazStatusResult(data);

      if (data.online) {
        addToast(`SEFAZ-MG Operacional! (${data.tempoRespostaMs}ms) - [${data.cStat}] ${data.xMotivo}`, 'success');
      } else if (data.configured) {
        addToast(`SEFAZ-MG: [${data.cStat || 'Aviso'}] ${data.xMotivo || data.message || data.error}`, 'error');
      } else {
        addToast('Salve o Certificado Digital A1 antes de testar a SEFAZ.', 'info');
      }
    } catch (err: any) {
      console.error('Erro ao testar status da SEFAZ:', err);
      addToast(err.message || 'Falha ao comunicar com a SEFAZ.', 'error');
    } finally {
      setIsCheckingSefaz(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      carregarConfiguracoes();
    }
  }, [isOpen]);

  const carregarConfiguracoes = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/erp/fiscal/settings');
      const data = await res.json();
      if (data.success && data.data) {
        const c = data.data;
        setCnpj(c.cnpj || '');
        setRazaoSocial(c.razao_social || '');
        setNomeFantasia(c.nome_fantasia || '');
        setInscricaoEstadual(c.inscricao_estadual || '');
        setLogradouro(c.logradouro || '');
        setNumero(c.numero || '');
        setBairro(c.bairro || '');
        setMunicipio(c.municipio || '');
        setCodMunicipioIbge(c.cod_municipio_ibge || '3136702');
        setUf(c.uf || 'MG');
        setCep(c.cep || '');
        setRegimeTributario(String(c.regime_tributario || 1));
        setAmbiente(c.ambiente || 'homologacao');
        setNfeSeries(c.nfe_series || 1);
        setNextNfeNumber(c.next_nfe_number || 1);
        setCsc(c.csc || '');
        setIdCsc(c.id_csc || '000001');
        setHasCertificate(Boolean(c.has_certificate));
      }
    } catch (err: any) {
      console.error('Erro ao carregar configurações fiscais:', err);
      addToast('Não foi possível carregar os parâmetros fiscais.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCertificateUpload = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'pfx' && ext !== 'p12') {
      addToast('Por favor selecione um certificado válido no formato .pfx ou .p12 (A1).', 'error');
      return;
    }

    setCertificateFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string)?.split(',')[1];
      if (base64) {
        setCertificatePfxBase64(base64);
        setHasCertificate(true);
        addToast(`Certificado ${file.name} carregado! Digite a senha para salvar.`, 'info');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSalvar = async () => {
    setIsSaving(true);
    try {
      const payload: any = {
        cnpj,
        razao_social: razaoSocial,
        nome_fantasia: nomeFantasia,
        inscricao_estadual: inscricaoEstadual,
        logradouro,
        numero,
        bairro,
        municipio,
        cod_municipio_ibge: codMunicipioIbge,
        uf,
        cep,
        regime_tributario: parseInt(regimeTributario, 10),
        ambiente,
        nfe_series: parseInt(String(nfeSeries), 10),
        next_nfe_number: parseInt(String(nextNfeNumber), 10),
        csc,
        id_csc: idCsc
      };

      if (certificatePfxBase64) {
        payload.certificate_pfx_base64 = certificatePfxBase64;
      }
      if (certificatePassword) {
        payload.certificate_password = certificatePassword;
      }

      const res = await fetch('/api/erp/fiscal/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao salvar parâmetros fiscais.');
      }

      addToast('Configurações fiscais salvas com sucesso!', 'success');
      onClose();
    } catch (err: any) {
      console.error('Erro ao salvar fiscal settings:', err);
      addToast(err.message || 'Falha ao salvar configurações fiscais.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header Modal */}
        <div className="p-4 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white shadow-md">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Parâmetros Fiscais & NFC-e
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  ambiente === 'producao' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                }`}>
                  {ambiente === 'producao' ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO (TESTES)'}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Configurações da empresa, numeração sequencial, CSC da SEFAZ e Certificado Digital A1.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo do Formulário */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6 text-xs text-slate-300">
          {isLoading ? (
            <div className="py-12 text-center text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-emerald-400" />
              Carregando dados fiscais...
            </div>
          ) : (
            <>
              {/* 1. Identificação da Farmácia */}
              <div className="space-y-3">
                <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-1">
                  <Building2 className="w-4 h-4 text-emerald-400" />
                  Dados do Emitente (Farmácia)
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">CNPJ</label>
                    <input
                      type="text"
                      value={cnpj}
                      onChange={(e) => setCnpj(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Inscrição Estadual (IE)</label>
                    <input
                      type="text"
                      value={inscricaoEstadual}
                      onChange={(e) => setInscricaoEstadual(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Regime Tributário</label>
                    <select
                      value={regimeTributario}
                      onChange={(e) => setRegimeTributario(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="1">1 - Simples Nacional (ME/EPP)</option>
                      <option value="3">3 - Regime Normal (Lucro Real/Presumido)</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-slate-400 font-semibold mb-1">Razão Social</label>
                    <input
                      type="text"
                      value={razaoSocial}
                      onChange={(e) => setRazaoSocial(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-semibold focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Nome Fantasia</label>
                    <input
                      type="text"
                      value={nomeFantasia}
                      onChange={(e) => setNomeFantasia(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Endereço */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                  <div className="col-span-2">
                    <label className="block text-slate-400 font-semibold mb-1">Logradouro</label>
                    <input
                      type="text"
                      value={logradouro}
                      onChange={(e) => setLogradouro(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Número</label>
                    <input
                      type="text"
                      value={numero}
                      onChange={(e) => setNumero(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Bairro</label>
                    <input
                      type="text"
                      value={bairro}
                      onChange={(e) => setBairro(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Município</label>
                    <input
                      type="text"
                      value={municipio}
                      onChange={(e) => setMunicipio(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Cód. IBGE Município</label>
                    <input
                      type="text"
                      value={codMunicipioIbge}
                      onChange={(e) => setCodMunicipioIbge(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">UF</label>
                    <input
                      type="text"
                      value={uf}
                      maxLength={2}
                      onChange={(e) => setUf(e.target.value.toUpperCase())}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-bold text-center focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">CEP</label>
                    <input
                      type="text"
                      value={cep}
                      onChange={(e) => setCep(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* 2. Parâmetros da NFC-e & Numeração */}
              <div className="space-y-3 pt-2">
                <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-1">
                  <Hash className="w-4 h-4 text-emerald-400" />
                  Parâmetros de Emissão NFC-e
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Ambiente SEFAZ</label>
                    <select
                      value={ambiente}
                      onChange={(e) => setAmbiente(e.target.value as any)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-semibold focus:outline-none focus:border-emerald-500"
                    >
                      <option value="homologacao">Homologação (Testes)</option>
                      <option value="producao">Produção (Oficial)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Série da NFC-e</label>
                    <input
                      type="number"
                      min="1"
                      value={nfeSeries}
                      onChange={(e) => setNfeSeries(parseInt(e.target.value, 10) || 1)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-bold text-center focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Próximo Número NFC-e</label>
                    <input
                      type="number"
                      min="1"
                      value={nextNfeNumber}
                      onChange={(e) => setNextNfeNumber(parseInt(e.target.value, 10) || 1)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-bold text-center focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Id do Token CSC</label>
                    <input
                      type="text"
                      value={idCsc}
                      placeholder="000001"
                      onChange={(e) => setIdCsc(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono text-center focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="md:col-span-4">
                    <label className="block text-slate-400 font-semibold mb-1">
                      Código de Segurança do Contribuinte (Token CSC da SEFAZ)
                    </label>
                    <input
                      type="text"
                      value={csc}
                      placeholder="Ex: 1234567890ABCDEF1234567890ABCDEF"
                      onChange={(e) => setCsc(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                    />
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Obtido no Portal da SEFAZ Estadual (SIARE em Minas Gerais). Utilizado para autenticar o QR Code do cupom fiscal.
                    </p>
                  </div>
                </div>
              </div>

              {/* 3. Certificado Digital A1 (.pfx) */}
              <div className="space-y-3 pt-2">
                <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-1">
                  <FileKey className="w-4 h-4 text-emerald-400" />
                  Certificado Digital A1 (.pfx / .p12)
                </div>

                <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-4">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        hasCertificate ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'
                      }`}>
                        <Lock className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-bold text-white flex items-center gap-2">
                          {hasCertificate ? 'Certificado A1 Configurado' : 'Nenhum Certificado A1 Vinculado'}
                          {hasCertificate && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              Ativo
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400">
                          {certificateFileName || (hasCertificate ? 'Certificado criptografado no banco de dados' : 'Envie o arquivo .pfx para assinar cupons e baixar NF-e')}
                        </p>
                      </div>
                    </div>

                    <label className="cursor-pointer px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold text-xs transition-colors flex items-center gap-2">
                      <UploadCloud className="w-4 h-4" />
                      Selecionar Arquivo .PFX
                      <input
                        type="file"
                        accept=".pfx,.p12"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleCertificateUpload(e.target.files[0]);
                          }
                        }}
                      />
                    </label>
                  </div>

                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Senha do Certificado Digital</label>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      <input
                        type="password"
                        value={certificatePassword}
                        placeholder={hasCertificate ? '•••••••• (Preencha apenas se quiser alterar)' : 'Digite a senha do certificado'}
                        onChange={(e) => setCertificatePassword(e.target.value)}
                        className="w-full sm:w-80 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        disabled={isCheckingSefaz}
                        onClick={handleTestarSefaz}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 active:bg-slate-800 disabled:opacity-50 text-white rounded-lg font-semibold text-xs transition-colors flex items-center justify-center gap-2 border border-slate-600"
                        title="Verifica disponibilidade dos servidores da SEFAZ com mTLS"
                      >
                        {isCheckingSefaz ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                            Consultando SEFAZ...
                          </>
                        ) : (
                          <>
                            <Activity className="w-4 h-4 text-emerald-400" />
                            Testar Conexão SEFAZ
                          </>
                        )}
                      </button>
                    </div>

                    {/* Resultado do Teste SEFAZ */}
                    {sefazStatusResult && (
                      <div className={`mt-3 p-3.5 rounded-xl border text-xs ${
                        sefazStatusResult.online
                          ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                          : 'bg-rose-950/30 border-rose-500/40 text-rose-200'
                      }`}>
                        <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/10">
                          <div className="flex items-center gap-2 font-bold">
                            {sefazStatusResult.online ? (
                              <>
                                <Wifi className="w-4 h-4 text-emerald-400" />
                                <span>SEFAZ-MG Operacional</span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono">
                                  {sefazStatusResult.tempoRespostaMs}ms
                                </span>
                              </>
                            ) : (
                              <>
                                <WifiOff className="w-4 h-4 text-rose-400" />
                                <span>SEFAZ Indisponível ou Erro</span>
                              </>
                            )}
                          </div>
                          <span className="text-[10px] uppercase font-bold opacity-80">
                            {sefazStatusResult.ambiente || ambiente}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <span className="opacity-70">Retorno SEFAZ: </span>
                            <span className="font-semibold font-mono">
                              [{sefazStatusResult.cStat || 'OFF'}] {sefazStatusResult.xMotivo || sefazStatusResult.message || sefazStatusResult.error}
                            </span>
                          </div>

                          {sefazStatusResult.certificado && (
                            <div>
                              <span className="opacity-70">Certificado: </span>
                              <span className="font-semibold">
                                {sefazStatusResult.certificado.cnpj ? `CNPJ ${sefazStatusResult.certificado.cnpj}` : sefazStatusResult.certificado.titular}
                                {sefazStatusResult.certificado.isExpired ? (
                                  <span className="ml-1 text-rose-400 font-bold">(EXPIRADO)</span>
                                ) : (
                                  <span className="ml-1 text-emerald-400 font-bold">(Válido até {new Date(sefazStatusResult.certificado.validTo).toLocaleDateString('pt-BR')})</span>
                                )}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer com Botão de Gravar */}
        <div className="p-4 bg-slate-800 border-t border-slate-700 flex items-center justify-between">
          <p className="text-[11px] text-slate-400">
            A numeração de notas é incrementada automaticamente a cada cupom emitido.
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-semibold text-xs transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSalvar}
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md shadow-emerald-950/40 transition-all flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Salvar Configurações
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
