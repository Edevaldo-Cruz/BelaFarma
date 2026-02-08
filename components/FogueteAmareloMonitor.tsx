import React, { useState, useEffect } from 'react';
import './FogueteAmareloMonitor.css';
import type { FogueteAmareloDashboard } from '../types';

export function FogueteAmareloMonitor() {
  const [notas, setNotas] = useState<FogueteAmareloDashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Estados para modal de lançamento
  const [isLancamentoModalOpen, setIsLancamentoModalOpen] = useState(false);
  const [selectedNota, setSelectedNota] = useState<FogueteAmareloDashboard | null>(null);
  const [lancamentoValue, setLancamentoValue] = useState('');
  const [lancamentoDate, setLancamentoDate] = useState(new Date().toISOString().split('T')[0]);
  const [lancamentoObs, setLancamentoObs] = useState('');
  
  // Estados para histórico de lançamentos
  const [isHistoricoModalOpen, setIsHistoricoModalOpen] = useState(false);
  const [historicoLancamentos, setHistoricoLancamentos] = useState<any[]>([]);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('http://localhost:3001/api/foguete-amarelo/dashboard');
      if (!response.ok) throw new Error('Erro ao buscar dados');
      const data = await response.json();
      setNotas(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      console.error('Erro ao buscar dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistoricoLancamentos = async (invoiceId: string) => {
    try {
      const response = await fetch(`http://localhost:3001/api/foguete-amarelo/lancamentos/${invoiceId}`);
      if (!response.ok) throw new Error('Erro ao buscar histórico');
      const data = await response.json();
      setHistoricoLancamentos(data);
    } catch (err) {
      console.error('Erro ao buscar histórico de lançamentos:', err);
      setHistoricoLancamentos([]);
    }
  };

  const handleOpenLancamentoModal = (nota: FogueteAmareloDashboard) => {
    setSelectedNota(nota);
    setLancamentoValue('');
    setLancamentoDate(new Date().toISOString().split('T')[0]);
    setLancamentoObs('');
    setIsLancamentoModalOpen(true);
  };

  const handleOpenHistoricoModal = async (nota: FogueteAmareloDashboard) => {
    setSelectedNota(nota);
    await fetchHistoricoLancamentos(nota.id);
    setIsHistoricoModalOpen(true);
  };

  const handleSaveLancamento = async () => {
    if (!selectedNota || !lancamentoValue) {
      alert('Preencha o valor do lançamento');
      return;
    }

    const value = parseFloat(lancamentoValue.replace(/\D/g, '')) / 100;
    
    if (value <= 0) {
      alert('Valor deve ser maior que zero');
      return;
    }

    if (value > selectedNota.remaining_value) {
      alert(`Valor não pode ser maior que o saldo restante (${formatCurrency(selectedNota.remaining_value)})`);
      return;
    }

    try {
      const response = await fetch('http://localhost:3001/api/foguete-amarelo/lancar-pagamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: selectedNota.id,
          invoiceNumber: selectedNota.invoice_number,
          value,
          paymentDate: lancamentoDate,
          observations: lancamentoObs,
          userId: 'admin' // TODO: pegar do contexto do usuário
        })
      });

      const result = await response.json();

      if (result.success) {
        alert('✅ Lançamento registrado com sucesso!');
        setIsLancamentoModalOpen(false);
        fetchDashboard(); // Atualizar dashboard
      } else {
        alert('❌ Erro ao registrar lançamento: ' + result.error);
      }
    } catch (err) {
      console.error('Erro ao salvar lançamento:', err);
      alert('❌ Erro ao salvar lançamento');
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('pt-BR');
  };

  const getUrgencyClass = (days: number) => {
    if (days < 0) return 'overdue';
    if (days <= 15) return 'urgent';
    if (days <= 30) return 'warning';
    return 'normal';
  };

  if (loading) {
    return (
      <div className="foguete-amarelo-dashboard">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Carregando dados...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="foguete-amarelo-dashboard">
        <div className="error-container">
          <h3>❌ Erro ao carregar dados</h3>
          <p>{error}</p>
          <button onClick={fetchDashboard} className="btn-retry">
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="foguete-amarelo-dashboard">
      <div className="dashboard-header">
        <div className="header-content">
          <h2>🚀 Monitoramento Foguete Amarelo - Cimed</h2>
          <p className="subtitle">Acompanhe em tempo real a amortização das suas notas fiscais</p>
        </div>
        <button onClick={fetchDashboard} className="btn-refresh">
          🔄 Atualizar
        </button>
      </div>

      <div className="resumo-monitoramento">
        {notas.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <h3>Nenhuma nota Foguete Amarelo ativa</h3>
            <p>Marque um pedido como "É Foguete Amarelo?" e entregue-o para começar o acompanhamento.</p>
          </div>
        ) : (
          <>
            <div className="dashboard-summary">
              <div className="summary-card">
                <div className="summary-icon">📊</div>
                <div className="summary-content">
                  <span className="summary-label">Total de Notas Ativas</span>
                  <span className="summary-value">{notas.length}</span>
                </div>
              </div>
              <div className="summary-card">
                <div className="summary-icon">💰</div>
                <div className="summary-content">
                  <span className="summary-label">Valor Total Original</span>
                  <span className="summary-value">
                    {formatCurrency(notas.reduce((sum, n) => sum + n.original_value, 0))}
                  </span>
                </div>
              </div>
              <div className="summary-card">
                <div className="summary-icon">✅</div>
                <div className="summary-content">
                  <span className="summary-label">Total Amortizado</span>
                  <span className="summary-value">
                    {formatCurrency(notas.reduce((sum, n) => sum + n.amortized_value, 0))}
                  </span>
                </div>
              </div>
              <div className="summary-card">
                <div className="summary-icon">⏳</div>
                <div className="summary-content">
                  <span className="summary-label">Saldo Restante</span>
                  <span className="summary-value">
                    {formatCurrency(notas.reduce((sum, n) => sum + n.remaining_value, 0))}
                  </span>
                </div>
              </div>
            </div>

            <div className="notas-grid">
              {notas.map(nota => (
                <div key={nota.id} className="nota-card">
                  <div className="nota-header">
                    <div className="nota-title">
                      <h3>NF: {nota.invoice_number}</h3>
                      <span className="supplier">{nota.supplier_name}</span>
                    </div>
                    <div className={`status-badge ${getUrgencyClass(nota.dias_ate_vencimento)}`}>
                      {nota.dias_ate_vencimento < 0 
                        ? `Vencida há ${Math.abs(nota.dias_ate_vencimento)} dias`
                        : `${nota.dias_ate_vencimento} dias restantes`
                      }
                    </div>
                  </div>

                  <div className="nota-dates">
                    <div className="date-item">
                      <label>📅 Emissão</label>
                      <span>{formatDate(nota.issue_date)}</span>
                    </div>
                    <div className="date-item">
                      <label>📆 Vencimento</label>
                      <span>{formatDate(nota.payment_due_date)}</span>
                    </div>
                  </div>

                  <div className="nota-values">
                    <div className="value-row">
                      <span className="value-label">💰 Valor Original</span>
                      <span className="value original">{formatCurrency(nota.original_value)}</span>
                    </div>
                    <div className="value-row">
                      <span className="value-label">✅ Já Amortizado</span>
                      <span className="value amortized">
                        {formatCurrency(nota.amortized_value)}
                        <span className="percentage"> ({nota.percentual_amortizado.toFixed(1)}%)</span>
                      </span>
                    </div>
                    <div className="value-row">
                      <span className="value-label">⏳ Saldo Restante</span>
                      <span className="value remaining">{formatCurrency(nota.remaining_value)}</span>
                    </div>
                  </div>

                  <div className="progress-section">
                    <div className="progress-bar-container">
                      <div className="progress-bar">
                        <div 
                          className="progress-fill" 
                          style={{ width: `${Math.min(nota.percentual_amortizado, 100)}%` }}
                        >
                          {nota.percentual_amortizado > 10 && (
                            <span className="progress-text">
                              {nota.percentual_amortizado.toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </div>
                      {nota.percentual_amortizado <= 10 && (
                        <span className="progress-label-outside">
                          {nota.percentual_amortizado.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="nota-footer">
                    <div className="payments-info">
                      <span className="payments-icon">📦</span>
                      <span className="payments-text">
                        {nota.total_pagamentos} lançamento{nota.total_pagamentos !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="nota-actions">
                      <button 
                        className="btn-lancar"
                        onClick={() => handleOpenLancamentoModal(nota)}
                        title="Lançar Pagamento"
                      >
                        💰 Lançar
                      </button>
                      <button 
                        className="btn-historico"
                        onClick={() => handleOpenHistoricoModal(nota)}
                        title="Ver Histórico"
                      >
                        📋 Histórico
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal de Lançamento de Pagamento */}
      {isLancamentoModalOpen && selectedNota && (
        <div className="modal-overlay" onClick={() => setIsLancamentoModalOpen(false)}>
          <div className="modal-content lancamento-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>💰 Lançar Pagamento</h3>
              <button className="modal-close" onClick={() => setIsLancamentoModalOpen(false)}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="nota-info-resumo">
                <p><strong>NF:</strong> {selectedNota.invoice_number}</p>
                <p><strong>Fornecedor:</strong> {selectedNota.supplier_name}</p>
                <p><strong>Saldo Restante:</strong> <span className="valor-destaque">{formatCurrency(selectedNota.remaining_value)}</span></p>
              </div>

              <div className="form-group">
                <label>Valor do Lançamento *</label>
                <input
                  type="text"
                  value={lancamentoValue}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/\D/g, '');
                    const num = parseInt(cleaned, 10) || 0;
                    setLancamentoValue(formatCurrency(num / 100));
                  }}
                  placeholder="R$ 0,00"
                  className="input-currency"
                />
              </div>

              <div className="form-group">
                <label>Data do Pagamento *</label>
                <input
                  type="date"
                  value={lancamentoDate}
                  onChange={(e) => setLancamentoDate(e.target.value)}
                  className="input-date"
                />
              </div>

              <div className="form-group">
                <label>Observações</label>
                <textarea
                  value={lancamentoObs}
                  onChange={(e) => setLancamentoObs(e.target.value)}
                  placeholder="Ex: Pagamento antecipado, desconto, etc..."
                  rows={3}
                  className="input-textarea"
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setIsLancamentoModalOpen(false)}>
                Cancelar
              </button>
              <button className="btn-confirm" onClick={handleSaveLancamento}>
                ✅ Confirmar Lançamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Histórico de Lançamentos */}
      {isHistoricoModalOpen && selectedNota && (
        <div className="modal-overlay" onClick={() => setIsHistoricoModalOpen(false)}>
          <div className="modal-content historico-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📋 Histórico de Lançamentos</h3>
              <button className="modal-close" onClick={() => setIsHistoricoModalOpen(false)}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="nota-info-resumo">
                <p><strong>NF:</strong> {selectedNota.invoice_number}</p>
                <p><strong>Fornecedor:</strong> {selectedNota.supplier_name}</p>
              </div>

              {historicoLancamentos.length === 0 ? (
                <div className="empty-historico">
                  <p>📭 Nenhum lançamento registrado ainda</p>
                </div>
              ) : (
                <div className="historico-list">
                  {historicoLancamentos.map((lanc, index) => (
                    <div key={lanc.id} className="historico-item">
                      <div className="historico-header">
                        <span className="historico-numero">#{historicoLancamentos.length - index}</span>
                        <span className="historico-data">{formatDate(lanc.payment_date)}</span>
                      </div>
                      <div className="historico-valor">
                        <span className="label">Valor:</span>
                        <span className="valor">{formatCurrency(lanc.value)}</span>
                      </div>
                      {lanc.observations && (
                        <div className="historico-obs">
                          <span className="label">Obs:</span>
                          <span className="text">{lanc.observations}</span>
                        </div>
                      )}
                      <div className="historico-footer">
                        <span className="historico-time">
                          {new Date(lanc.created_at).toLocaleString('pt-BR')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setIsHistoricoModalOpen(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
