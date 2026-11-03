const { garantirContaFixaInss, obterInssDinamicoParaMesPagamento } = require('./services/prolabore-inss.service');

// GET /api/fixed-account-payments - Get payments for a specific month (with auto-generation)
app.get('/api/fixed-account-payments', (req, res) => {
  try {
    garantirContaFixaInss(db);
    let { month, year } = req.query; // Expected format: YYYY-MM
    
    if (!month) {
      return res.status(400).json({ error: 'Month parameter is required' });
    }
    
    let targetYear = year;
    let targetMonthNum = month;

    if (String(month).includes('-')) {
      const parts = String(month).split('-');
      targetYear = parts[0];
      targetMonthNum = parts[1];
    }

    if (!targetYear) targetYear = new Date().getFullYear().toString();
    targetMonthNum = String(targetMonthNum).padStart(2, '0');
    const monthKey = `${targetYear}-${targetMonthNum}`;

    // 1. Check if payments already exist for this month
    let payments = db.prepare('SELECT * FROM fixed_account_payments WHERE month = ?').all(monthKey);
    const inssInfo = obterInssDinamicoParaMesPagamento(db, monthKey);

    // 2. If no payments exist, generate them automatically from active fixed accounts
    if (payments.length === 0) {
      const activeAccounts = db.prepare('SELECT * FROM fixed_accounts WHERE isActive = 1').all();
      
      activeAccounts.forEach(acc => {
        const dueDay = String(acc.dueDay || 1).padStart(2, '0');
        const dueDate = `${targetYear}-${targetMonthNum}-${dueDay}`;
        const isAccountInss = acc.name && acc.name.toLowerCase().includes('inss pr');
        const val = isAccountInss ? inssInfo.valorInss : acc.value;
        
        const payment = {
          id: `fap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          fixedAccountId: acc.id,
          fixedAccountName: acc.name,
          value: val,
          dueDate,
          month: monthKey,
          status: 'Pendente',
          paidAt: null,
          notes: null
        };
        
        db.prepare(`
          INSERT INTO fixed_account_payments 
          (id, fixedAccountId, fixedAccountName, value, dueDate, month, status, paidAt, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          payment.id,
          payment.fixedAccountId,
          payment.fixedAccountName,
          payment.value,
          payment.dueDate,
          payment.month,
          payment.status,
          payment.paidAt,
          payment.notes
        );
        
        payments.push(payment);
      });
      
      console.log(`Auto-generated ${payments.length} fixed account payments for ${monthKey}`);
    } else {
      // Se pagamentos já existiam para o mês, verifica se a conta 'INSS Pró-labore' já está incluída
      const inssPayment = payments.find(p => p.fixedAccountName && p.fixedAccountName.toLowerCase().includes('inss pr'));
      if (!inssPayment) {
        const inssAcc = db.prepare("SELECT * FROM fixed_accounts WHERE LOWER(name) LIKE '%inss pr%'").get();
        if (inssAcc && inssAcc.isActive) {
          const dueDate = `${targetYear}-${targetMonthNum}-20`;
          const newPayment = {
            id: `fap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            fixedAccountId: inssAcc.id,
            fixedAccountName: inssAcc.name,
            value: inssInfo.valorInss,
            dueDate,
            month: monthKey,
            status: 'Pendente',
            paidAt: null,
            notes: null
          };
          db.prepare(`
            INSERT INTO fixed_account_payments 
            (id, fixedAccountId, fixedAccountName, value, dueDate, month, status, paidAt, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            newPayment.id,
            newPayment.fixedAccountId,
            newPayment.fixedAccountName,
            newPayment.value,
            newPayment.dueDate,
            newPayment.month,
            newPayment.status,
            newPayment.paidAt,
            newPayment.notes
          );
          payments.push(newPayment);
        }
      }
    }

    // Injeta detalhes dinâmicos atualizados para a conta INSS Pró-labore caso não esteja paga
    payments = payments.map(p => {
      const isAccountInss = p.fixedAccountName && p.fixedAccountName.toLowerCase().includes('inss pr');
      if (isAccountInss) {
        const itemCopy = { ...p };
        if (p.status !== 'Pago') {
          itemCopy.value = inssInfo.valorInss;
        }
        itemCopy.isDynamic = true;
        itemCopy.dynamicDetails = inssInfo;
        return itemCopy;
      }
      return p;
    });
    
    res.json(payments);
  } catch (error) {
    console.error('Error fetching fixed account payments:', error);
    res.status(500).json({ error: 'Failed to fetch fixed account payments' });
  }
});


// PUT /api/fixed-account-payments/:id - Update payment status
app.put('/api/fixed-account-payments/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { status, paidAt, notes } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }
    
    const stmt = db.prepare(`
      UPDATE fixed_account_payments 
      SET status = ?, paidAt = ?, notes = ?
      WHERE id = ?
    `);
    
    const result = stmt.run(status, paidAt || null, notes || null, id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    res.json({ success: true, message: 'Payment updated successfully' });
  } catch (error) {
    console.error('Error updating fixed account payment:', error);
    res.status(500).json({ error: 'Failed to update payment' });
  }
});

// GET /api/fixed-account-payments/history - Get payment history for a specific account
app.get('/api/fixed-account-payments/history/:fixedAccountId', (req, res) => {
  try {
    const { fixedAccountId } = req.params;
    const payments = db.prepare(
      'SELECT * FROM fixed_account_payments WHERE fixedAccountId = ? ORDER BY dueDate DESC'
    ).all(fixedAccountId);
    
    res.json(payments);
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});
