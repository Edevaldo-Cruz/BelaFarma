/**
 * Message Templates Service — BelaFarma
 * Gerencia templates editáveis de mensagens e faz substituição de variáveis.
 * 
 * Templates são armazenados no banco (message_templates) e podem ser 
 * editados via painel admin.
 * 
 * Variáveis suportadas:
 *   {nome}           - Nome do cliente
 *   {apelido}        - Apelido do cliente
 *   {telefone}       - Telefone do cliente
 *   {valor}          - Valor (cobrança/promoção)
 *   {data_vencimento} - Data de vencimento
 *   {nome_farmacia}  - "Bela Farma Sul"
 *   {data_hoje}      - Data atual formatada
 */

const FARM_NAME = 'Bela Farma Sul';

/**
 * Substitui variáveis no template
 * @param {string} template - Template com variáveis entre chaves
 * @param {object} variables - Objeto com os valores das variáveis
 * @returns {string} Mensagem com variáveis substituídas
 */
function renderTemplate(template, variables = {}) {
  const today = new Date();
  const formattedDate = today.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  const defaults = {
    nome_farmacia: FARM_NAME,
    data_hoje: formattedDate,
  };

  const allVars = { ...defaults, ...variables };

  let result = template;
  for (const [key, value] of Object.entries(allVars)) {
    const regex = new RegExp(`\\{${key}\\}`, 'gi');
    result = result.replace(regex, value != null ? String(value) : '');
  }

  return result;
}

/**
 * Templates padrão que são inseridos no banco na primeira execução.
 * O usuário pode editá-los depois pelo painel.
 */
const DEFAULT_TEMPLATES = [
  {
    type: 'cobranca',
    name: 'Cobrança de Crediário',
    content: `Olá, {nome}! 👋

Aqui é da *{nome_farmacia}*.

Gostaríamos de lembrar que você possui um valor em aberto de *R$ {valor}*.
📅 Vencimento: {data_vencimento}

Por favor, procure regularizar sua situação.
Qualquer dúvida, estamos à disposição! 😊

_Mensagem automática - {nome_farmacia}_`,
    isActive: true,
  },
  {
    type: 'aniversario',
    name: 'Feliz Aniversário',
    content: `🎂🎉 *Parabéns, {nome}!* 🎉🎂

A equipe da *{nome_farmacia}* deseja a você um muito feliz aniversário! 🥳

Que este novo ciclo traga muita saúde, paz e alegria! 💖

Venha nos visitar, temos uma surpresa especial para você! 🎁

_Com carinho, {nome_farmacia}_ ✨`,
    isActive: true,
  },
  {
    type: 'promocao',
    name: 'Promoção Geral',
    content: `🏷️ *PROMOÇÃO {nome_farmacia}!* 🏷️

Olá, {nome}! 

{mensagem_promocao}

Corra, é por tempo limitado! ⏰

📍 Venha aproveitar!

_Quer parar de receber promoções? Responda SAIR._`,
    isActive: true,
  },
  {
    type: 'boas_vindas',
    name: 'Boas-Vindas Novo Cliente',
    content: `Olá, {nome}! 👋

Seja bem-vindo(a) à *{nome_farmacia}*! 🏪

É um prazer ter você como nosso cliente. Estamos aqui para cuidar da sua saúde com os melhores preços e atendimento! 💊😊

Fique à vontade para nos chamar sempre que precisar.

_Equipe {nome_farmacia}_ ❤️`,
    isActive: true,
  },
];

/**
 * Inicializa os templates padrão no banco (se não existirem).
 * Chamado na inicialização do servidor.
 */
function initializeDefaultTemplates(db) {
  if (!db) return;

  try {
    const existingCount = db.prepare('SELECT COUNT(*) as count FROM message_templates').get();
    
    if (existingCount.count === 0) {
      console.log('[MessageTemplates] Inserindo templates padrão...');
      
      const stmt = db.prepare(`
        INSERT INTO message_templates (id, type, name, content, isActive, createdAt, updatedAt)
        VALUES (@id, @type, @name, @content, @isActive, @createdAt, @updatedAt)
      `);

      const now = new Date().toISOString();
      
      for (const template of DEFAULT_TEMPLATES) {
        stmt.run({
          id: `tpl-${template.type}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          type: template.type,
          name: template.name,
          content: template.content,
          isActive: template.isActive ? 1 : 0,
          createdAt: now,
          updatedAt: now,
        });
      }

      console.log(`[MessageTemplates] ✅ ${DEFAULT_TEMPLATES.length} templates padrão inseridos.`);
    }
  } catch (error) {
    console.error('[MessageTemplates] Erro ao inicializar templates:', error.message);
  }
}

/**
 * Busca o template ativo de um tipo específico
 * @param {object} db - Instância do banco de dados 
 * @param {string} type - Tipo do template ('cobranca', 'aniversario', 'promocao', 'boas_vindas')
 * @returns {object|null} Template ou null
 */
function getActiveTemplate(db, type) {
  try {
    return db.prepare('SELECT * FROM message_templates WHERE type = ? AND isActive = 1 LIMIT 1').get(type);
  } catch (error) {
    console.error(`[MessageTemplates] Erro ao buscar template ${type}:`, error.message);
    return null;
  }
}

/**
 * Gera a mensagem de cobrança para um cliente
 */
function generateDebtMessage(db, customer, debtInfo) {
  const template = getActiveTemplate(db, 'cobranca');
  if (!template) return null;

  return renderTemplate(template.content, {
    nome: customer.nickname || customer.name,
    apelido: customer.nickname || '',
    telefone: customer.phone || '',
    valor: Number(debtInfo.totalValue).toFixed(2),
    data_vencimento: debtInfo.dueDate || 'não definido',
  });
}

/**
 * Gera a mensagem de aniversário para um cliente
 */
function generateBirthdayMessage(db, customer) {
  const template = getActiveTemplate(db, 'aniversario');
  if (!template) return null;

  return renderTemplate(template.content, {
    nome: customer.nickname || customer.name,
    apelido: customer.nickname || '',
    telefone: customer.phone || '',
  });
}

/**
 * Gera a mensagem de promoção para um cliente
 */
function generatePromoMessage(db, customer, promoText) {
  const template = getActiveTemplate(db, 'promocao');
  if (!template) return null;

  return renderTemplate(template.content, {
    nome: customer.nickname || customer.name,
    apelido: customer.nickname || '',
    telefone: customer.phone || '',
    mensagem_promocao: promoText || '',
  });
}

module.exports = {
  renderTemplate,
  initializeDefaultTemplates,
  getActiveTemplate,
  generateDebtMessage,
  generateBirthdayMessage,
  generatePromoMessage,
  DEFAULT_TEMPLATES,
};
