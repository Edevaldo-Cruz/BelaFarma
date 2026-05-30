const db = require('../database.js');
const aiService = require('./ai.service.js');
const { v4: uuidv4 } = require('uuid');

class TriageAgentService {
  constructor() {
    this.waitingClients = new Map();
    
    // Feriados Nacionais + Juiz de Fora (Fixos)
    this.holidays = [
      '01-01', // Ano novo
      '21-04', // Tiradentes
      '01-05', // Dia do trabalho
      '31-05', // Aniversário JF
      '13-06', // Santo Antônio (Padroeiro JF)
      '07-09', // Independência
      '12-10', // Nossa Sra. Aparecida
      '02-11', // Finados
      '15-11', // Proclamação da República
      '25-12'  // Natal
      // Feriados móveis como Carnaval, Sexta-feira da Paixão, Corpus Christi precisarão ser ajustados anualmente
    ];
  }

  getSupplierByPhone(phone) {
    try {
      return db.prepare('SELECT * FROM suppliers WHERE whatsapp = ?').get(phone);
    } catch (e) {
      console.error('Erro ao buscar fornecedor:', e);
      return null;
    }
  }

  addSupplier(name, phone) {
    try {
      const id = uuidv4();
      const createdAt = new Date().toISOString();
      db.prepare('INSERT INTO suppliers (id, name, whatsapp, category, createdAt) VALUES (?, ?, ?, ?, ?)').run(id, name, phone, 'Identificado via IA', createdAt);
      return true;
    } catch (e) {
      console.error('Erro ao adicionar fornecedor:', e);
      return false;
    }
  }

  getCustomerByPhone(phone) {
    try {
      return db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
    } catch (e) {
      console.error('Erro ao buscar cliente:', e);
      return null;
    }
  }

  addCustomer(phone, name) {
    try {
      const id = uuidv4();
      const now = new Date().toISOString();
      // Preferences é a nova coluna que adicionamos
      db.prepare(`
        INSERT INTO customers (id, name, phone, createdAt, updatedAt, preferences) 
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, name, phone, now, now, '{}');
      return true;
    } catch (e) {
      console.error('Erro ao adicionar cliente:', e);
      return false;
    }
  }

  updateCustomerPreferences(phone, preferences) {
    try {
      const customer = this.getCustomerByPhone(phone);
      if (!customer) return false;
      
      let currentPrefs = {};
      try {
        if (customer.preferences) currentPrefs = JSON.parse(customer.preferences);
      } catch (e) {}

      const newPrefs = { ...currentPrefs, ...preferences };
      
      db.prepare('UPDATE customers SET preferences = ?, updatedAt = ? WHERE phone = ?')
        .run(JSON.stringify(newPrefs), new Date().toISOString(), phone);
      return true;
    } catch (e) {
      console.error('Erro ao atualizar preferências:', e);
      return false;
    }
  }

  isHolidayInJuizDeFora(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const formatted = `${day}-${month}`;
    return this.holidays.includes(formatted);
  }

  isBusinessHours(date = new Date()) {
    // Horários: Seg-Sex 07:30 - 21:00, Sáb 07:30 - 20:00, Dom Fechado. Feriado 07:30 - 14:00.
    const dayOfWeek = date.getDay(); // 0 = Domingo, 1 = Segunda, ... 6 = Sábado
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const timeInMinutes = hours * 60 + minutes;

    const isHoliday = this.isHolidayInJuizDeFora(date);
    
    // Domingo (Fechado)
    if (dayOfWeek === 0) return false;
    
    // Feriado: 07:30 (450m) até 14:00 (840m)
    if (isHoliday) {
      return timeInMinutes >= 450 && timeInMinutes < 840;
    }

    // Seg a Sex: 07:30 (450) até 21:00 (1260)
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      return timeInMinutes >= 450 && timeInMinutes < 1260;
    }

    // Sábado: 07:30 (450) até 20:00 (1200)
    if (dayOfWeek === 6) {
      return timeInMinutes >= 450 && timeInMinutes < 1200;
    }

    return false;
  }

  async classifySupplier(messageText) {
    const prompt = `Você é um classificador de intenções para uma farmácia. O objetivo é saber se quem enviou a mensagem a seguir é um fornecedor (distribuidora, vendendo remédios, cobrando boleto, enviando nota fiscal) ou se é um cliente comum.
Mensagem: "${messageText}"
Responda APENAS com a palavra SIM se for fornecedor, e NAO se for cliente ou qualquer outra coisa.`;
    
    try {
      // Usando o aiService que já deve estar configurado no projeto
      const response = await aiService.generateText(prompt);
      const text = response?.toLowerCase() || '';
      return text.includes('sim');
    } catch (e) {
      console.error('Erro na IA ao classificar fornecedor:', e);
      return false; // Na dúvida, não é fornecedor
    }
  }

  async handleTimeout(phone, name, originalMessage, sock) {
    console.log(`[TriageAgent] Timeout de 2 min atingido para ${phone}`);
    this.waitingClients.delete(phone);

    // Verifica se é fornecedor
    let isSupplier = false;
    const supplier = this.getSupplierByPhone(phone);
    if (supplier) {
      isSupplier = true;
    } else {
      isSupplier = await this.classifySupplier(originalMessage);
      if (isSupplier) {
        this.addSupplier(name || 'Fornecedor Desconhecido', phone);
      }
    }

    if (isSupplier) {
      await sock.sendMessage(phone, { text: "Olá! Identificamos que você é um fornecedor. Por favor, entre em contato diretamente com o nosso comercial pelo número 32 99807-3194." });
      return;
    }

    // Salva ou atualiza cliente
    let customer = this.getCustomerByPhone(phone);
    if (!customer) {
      this.addCustomer(phone, name || 'Cliente WhatsApp');
    }

    const businessHours = this.isBusinessHours();
    const saudacao = this.getSaudacao();
    const clientName = name ? name : 'cliente';

    if (businessHours) {
      let msg = `${saudacao} ${clientName}! Todos os nossos atendentes estão ocupados no momento, mas em breve você será atendido.`;
      
      const textLower = originalMessage.toLowerCase().trim();
      if (['bom dia', 'boa tarde', 'boa noite', 'olá', 'ola', 'oi'].includes(textLower)) {
        msg += " Para adiantar o atendimento, como podemos te ajudar hoje?";
      }
      await sock.sendMessage(phone, { text: msg });
    } else {
      // Fora do horário de funcionamento
      // Tentar extrair a intenção de agendamento usando IA
      let agendamento = "";
      try {
        const prompt = `Analise a mensagem do cliente para uma farmácia que está fechada agora. Identifique qual remédio ou produto ele quer comprar e extraia isso para agendar.
Mensagem: "${originalMessage}"
Responda no formato: "Produto: [nome]". Se não for possível identificar, responda "NENHUM".`;
        const res = await aiService.generateText(prompt);
        if (res && !res.toUpperCase().includes('NENHUM')) {
          agendamento = res.trim();
          this.updateCustomerPreferences(phone, { lastScheduleAttempt: agendamento, lastScheduleDate: new Date().toISOString() });
        }
      } catch (e) {
        console.error('Erro na IA agendamento fora de horario:', e);
      }

      let msgFechado = `${saudacao} ${clientName}! No momento estamos fechados.\nNosso horário de funcionamento é:\nSeg-Sex: 07:30 às 21:00\nSáb: 07:30 às 20:00\nFeriados: 07:30 às 14:00.`;
      
      if (agendamento) {
        msgFechado += `\nMas não se preocupe, já registramos seu interesse em "${agendamento}". Assim que abrirmos, um de nossos atendentes entrará em contato para agendar sua entrega!`;
      } else {
        msgFechado += `\nDeixe sua dúvida ou o que precisa escrito aqui, e assim que abrirmos entraremos em contato para ajudar!`;
      }
      
      await sock.sendMessage(phone, { text: msgFechado });
    }
  }

  getSaudacao() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Bom dia';
    if (hour >= 12 && hour < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  onMessageReceived(phone, name, messageText, fromMe, sock) {
    if (fromMe) {
      // Atendente respondeu! Cancela o timer.
      if (this.waitingClients.has(phone)) {
        console.log(`[TriageAgent] Atendente respondeu para ${phone}. Cancelando timer de 2 min.`);
        clearTimeout(this.waitingClients.get(phone));
        this.waitingClients.delete(phone);
      }
      return;
    }

    // Se já está aguardando, não reinicia o timer (ou poderia reiniciar, mas manter é melhor para não estender)
    if (this.waitingClients.has(phone)) {
      return;
    }

    // Cliente mandou a primeira mensagem
    console.log(`[TriageAgent] Cliente ${phone} mandou mensagem. Iniciando timer de 2 min...`);
    const timeoutId = setTimeout(() => {
      this.handleTimeout(phone, name, messageText, sock);
    }, 2 * 60 * 1000); // 2 minutos

    this.waitingClients.set(phone, timeoutId);
  }
}

module.exports = new TriageAgentService();
