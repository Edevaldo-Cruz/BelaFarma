import React, { useState, useEffect } from 'react';
import './FogueteAmareloMonitor.css'; // Reusing the same styles for now

export function InvoiceList() {
  const [todasNotas, setTodasNotas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAllInvoices();
  }, []);

  const fetchAllInvoices = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/invoices');
      if (!response.ok) throw new Error('Erro ao buscar notas fiscais');
      const data = await response.json();
      setTodasNotas(data);
    } catch (err) {
      console.error('Erro ao buscar histórico de notas:', err);
    } finally {
      setLoading(false);
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

  return (
    <div className="foguete-amarelo-dashboard">
      <div className="dashboard-header">
        <div className="header-content">
          <h2>📄 Notas Fiscais</h2>
          <p className="subtitle">Histórico completo de todas as notas fiscais registradas</p>
        </div>
        <button onClick={fetchAllInvoices} className="btn-refresh">
          🔄 Atualizar
        </button>
      </div>

      <div className="historico-container">
        {loading ? (
             <div className="loading-container">
                <div className="spinner"></div>
                <p>Carregando notas...</p>
             </div>
        ) : todasNotas.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <h3>Nenhuma nota fiscal cadastrada</h3>
            <p>As notas fiscais serão criadas automaticamente quando você entregar pedidos.</p>
          </div>
        ) : (
          <div className="historico-table-container">
            <table className="historico-table responsive-table">
              <thead>
                <tr>
                  <th>Número NF</th>
                  <th>Fornecedor</th>
                  <th>Emissão</th>
                  <th>Vencimento</th>
                  <th>Valor</th>
                  <th>Tipo</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {todasNotas.map(nota => (
                  <tr key={nota.id}>
                    <td className="font-bold">{nota.invoice_number}</td>
                    <td>{nota.supplier_name}</td>
                    <td>{formatDate(nota.issue_date)}</td>
                    <td>{formatDate(nota.payment_due_date)}</td>
                    <td className="font-bold">{formatCurrency(nota.total_value)}</td>
                    <td>
                      {nota.is_foguete_amarelo ? (
                        <span className="badge-foguete">🚀 Foguete Amarelo</span>
                      ) : (
                        <span className="badge-normal">📄 Normal</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge-status ${nota.status.toLowerCase()}`}>
                        {nota.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
