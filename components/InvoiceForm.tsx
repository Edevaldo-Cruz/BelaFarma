import React, { useState } from 'react';
import './InvoiceForm.css';
import type { InvoiceItem } from '../types';

interface InvoiceFormProps {
  userId: string;
  userName: string;
}

interface InvoiceFormData {
  invoiceNumber: string;
  supplierName: string;
  issueDate: string;
  totalValue: number;
  isFogueteAmarelo: boolean;
  notes: string;
}

export function InvoiceForm({ userId, userName }: InvoiceFormProps) {
  const [formData, setFormData] = useState<InvoiceFormData>({
    invoiceNumber: '',
    supplierName: '',
    issueDate: new Date().toISOString().split('T')[0],
    totalValue: 0,
    isFogueteAmarelo: false,
    notes: ''
  });

  const [items, setItems] = useState<Omit<InvoiceItem, 'id' | 'invoice_id' | 'quantity_sold' | 'quantity_remaining' | 'total_cost'>[]>([]);
  const [currentItem, setCurrentItem] = useState({
    product_code: '',
    product_name: '',
    quantity: 0,
    unit_cost: 0
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else if (name === 'totalValue') {
      setFormData(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleItemChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCurrentItem(prev => ({
      ...prev,
      [name]: name === 'quantity' || name === 'unit_cost' ? parseFloat(value) || 0 : value
    }));
  };

  const addItem = () => {
    if (!currentItem.product_code || !currentItem.product_name || currentItem.quantity <= 0 || currentItem.unit_cost <= 0) {
      setMessage({ type: 'error', text: 'Preencha todos os campos do produto corretamente' });
      return;
    }

    setItems(prev => [...prev, { ...currentItem }]);
    setCurrentItem({
      product_code: '',
      product_name: '',
      quantity: 0,
      unit_cost: 0
    });
    setMessage(null);
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + (item.quantity * item.unit_cost), 0);
  };

  const calculateDueDate = () => {
    if (!formData.isFogueteAmarelo || !formData.issueDate) return '';
    const date = new Date(formData.issueDate);
    date.setDate(date.getDate() + 120);
    return date.toLocaleDateString('pt-BR');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.invoiceNumber || !formData.supplierName || !formData.issueDate) {
      setMessage({ type: 'error', text: 'Preencha todos os campos obrigatórios' });
      return;
    }

    if (items.length === 0) {
      setMessage({ type: 'error', text: 'Adicione pelo menos um produto à nota fiscal' });
      return;
    }

    const calculatedTotal = calculateTotal();
    if (formData.totalValue > 0 && Math.abs(calculatedTotal - formData.totalValue) > 0.01) {
      const confirmDiff = window.confirm(
        `O valor total informado (R$ ${formData.totalValue.toFixed(2)}) difere do valor calculado dos itens (R$ ${calculatedTotal.toFixed(2)}). Deseja continuar com o valor calculado?`
      );
      if (!confirmDiff) return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          totalValue: calculatedTotal,
          items,
          userId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao cadastrar nota fiscal');
      }

      setMessage({ type: 'success', text: '✅ Nota fiscal cadastrada com sucesso!' });
      
      // Limpar formulário
      setFormData({
        invoiceNumber: '',
        supplierName: '',
        issueDate: new Date().toISOString().split('T')[0],
        totalValue: 0,
        isFogueteAmarelo: false,
        notes: ''
      });
      setItems([]);
      
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Erro ao cadastrar nota fiscal' 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="invoice-form-container">
      <div className="form-header">
        <h2>📄 Cadastrar Nota Fiscal</h2>
        <p className="subtitle">Registre notas fiscais de entrada e acompanhe o estoque</p>
      </div>

      {message && (
        <div className={`message-banner ${message.type}`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="invoice-form">
        <div className="form-section">
          <h3>Informações da Nota</h3>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="invoiceNumber">Número da Nota *</label>
              <input
                type="text"
                id="invoiceNumber"
                name="invoiceNumber"
                value={formData.invoiceNumber}
                onChange={handleInputChange}
                placeholder="Ex: 12345"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="supplierName">Fornecedor *</label>
              <input
                type="text"
                id="supplierName"
                name="supplierName"
                value={formData.supplierName}
                onChange={handleInputChange}
                placeholder="Ex: Cimed"
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="issueDate">Data de Emissão *</label>
              <input
                type="date"
                id="issueDate"
                name="issueDate"
                value={formData.issueDate}
                onChange={handleInputChange}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="totalValue">Valor Total (Opcional)</label>
              <input
                type="number"
                id="totalValue"
                name="totalValue"
                value={formData.totalValue || ''}
                onChange={handleInputChange}
                placeholder="Será calculado automaticamente"
                step="0.01"
                min="0"
              />
            </div>
          </div>

          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="isFogueteAmarelo"
                checked={formData.isFogueteAmarelo}
                onChange={handleInputChange}
              />
              <span className="checkbox-text">
                🚀 <strong>É Foguete Amarelo?</strong> (Prazo 120 dias com amortização por venda)
              </span>
            </label>
            {formData.isFogueteAmarelo && formData.issueDate && (
              <div className="due-date-info">
                📅 Vencimento automático: <strong>{calculateDueDate()}</strong>
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="notes">Observações</label>
            <textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              placeholder="Informações adicionais sobre a nota..."
              rows={3}
            />
          </div>
        </div>

        <div className="form-section">
          <h3>Produtos da Nota</h3>
          
          <div className="add-item-section">
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="product_code">Código/EAN</label>
                <input
                  type="text"
                  id="product_code"
                  name="product_code"
                  value={currentItem.product_code}
                  onChange={handleItemChange}
                  placeholder="Ex: 7891234567890"
                />
              </div>

              <div className="form-group">
                <label htmlFor="product_name">Nome do Produto</label>
                <input
                  type="text"
                  id="product_name"
                  name="product_name"
                  value={currentItem.product_name}
                  onChange={handleItemChange}
                  placeholder="Ex: Paracetamol 500mg"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="quantity">Quantidade</label>
                <input
                  type="number"
                  id="quantity"
                  name="quantity"
                  value={currentItem.quantity || ''}
                  onChange={handleItemChange}
                  placeholder="0"
                  step="0.01"
                  min="0"
                />
              </div>

              <div className="form-group">
                <label htmlFor="unit_cost">Custo Unitário (R$)</label>
                <input
                  type="number"
                  id="unit_cost"
                  name="unit_cost"
                  value={currentItem.unit_cost || ''}
                  onChange={handleItemChange}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
              </div>

              <div className="form-group">
                <label>Total do Item</label>
                <div className="calculated-value">
                  R$ {(currentItem.quantity * currentItem.unit_cost).toFixed(2)}
                </div>
              </div>
            </div>

            <button type="button" onClick={addItem} className="btn-add-item">
              ➕ Adicionar Produto
            </button>
          </div>

          {items.length > 0 && (
            <div className="items-list">
              <table className="items-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Produto</th>
                    <th>Qtd</th>
                    <th>Custo Unit.</th>
                    <th>Total</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={index}>
                      <td>{item.product_code}</td>
                      <td>{item.product_name}</td>
                      <td>{item.quantity}</td>
                      <td>R$ {item.unit_cost.toFixed(2)}</td>
                      <td>R$ {(item.quantity * item.unit_cost).toFixed(2)}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className="btn-remove"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} className="total-label">Total Calculado:</td>
                    <td className="total-value">R$ {calculateTotal().toFixed(2)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-submit" disabled={loading}>
            {loading ? '⏳ Salvando...' : '💾 Salvar Nota Fiscal'}
          </button>
        </div>
      </form>
    </div>
  );
}
