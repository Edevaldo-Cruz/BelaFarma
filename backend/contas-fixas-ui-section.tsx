// ADICIONAR ESTE CÓDIGO NO ContasAPagar.tsx APÓS A LINHA 297 (após </div> </div>)
// E ANTES DA LINHA 299 (antes de <div className="bg-white rounded-[2rem]...)

      {/* SEÇÃO DE CONTAS FIXAS */}
      {fixedPayments.length > 0 && (
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-[2rem] border-2 border-purple-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-purple-100/50 border-b-2 border-purple-200 flex items-center justify-between">
            <h3 className="text-sm font-black text-purple-900 uppercase tracking-widest flex items-center gap-2">
              📌 Contas Fixas - {monthOptions[selectedMonth].label.toUpperCase()}/{selectedYear}
            </h3>
            <div className="text-right">
              <p className="text-[10px] font-black text-purple-700/60 uppercase tracking-widest">Total</p>
              <p className="text-lg font-black text-purple-900">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalFixedPayments)}
              </p>
            </div>
          </div>
          <div className="p-6 space-y-3">
            {fixedPayments.map(payment => (
              <div 
                key={payment.id} 
                className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${
                  payment.status === 'Pago' 
                    ? 'bg-emerald-50/50 border-emerald-200' 
                    : 'bg-white border-purple-200 hover:border-purple-300'
                }`}
              >
                <div className="flex items-center gap-4 flex-1">
                  <button
                    onClick={() => handleToggleFixedPayment(payment)}
                    className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                      payment.status === 'Pago'
                        ? 'bg-emerald-500 border-emerald-600'
                        : 'bg-white border-slate-300 hover:border-purple-500'
                    }`}
                  >
                    {payment.status === 'Pago' && <CheckCircle2 className="w-4 h-4 text-white" />}
                  </button>
                  <div className="flex-1">
                    <p className={`font-black uppercase tracking-tight ${
                      payment.status === 'Pago' ? 'text-emerald-700 line-through' : 'text-slate-900'
                    }`}>
                      {payment.fixedAccountName}
                    </p>
                    <p className="text-xs text-slate-500 font-bold">
                      Vencimento: {new Date(payment.dueDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-lg font-black ${
                    payment.status === 'Pago' ? 'text-emerald-700' : 'text-purple-900'
                  }`}>
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(payment.value)}
                  </p>
                  {payment.status === 'Pago' && payment.paidAt && (
                    <p className="text-[10px] text-emerald-600 font-bold">
                      Pago em {new Date(payment.paidAt + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
