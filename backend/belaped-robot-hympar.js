/**
 * belaped-robot-hympar.js
 * Robô Oficial de Cotação e Montagem de Pedidos - HYMPAR (Hypera Pharma B2B)
 * 
 * Contrato Oficial BelaPed:
 *  - iniciar()
 *  - fechar()
 *  - cotarEAN(ean, descricao) [Estrito por EAN]
 *  - adicionarAoCarrinho(ean, quantidade, descricao)
 *  - contarItensCarrinho()
 *  - limparCarrinho()
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const { validarCorrespondenciaProduto } = require('./belaped-validador.js');

function findChromeExecutable() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Users\\User\\.cache\\puppeteer\\chrome\\win64-148.0.7778.97\\chrome-win64\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

class HymparRobot {
  constructor(options = {}) {
    this.usuario = options.usuario || 'primusdrogaria2022@gmail.com';
    this.senha = options.senha || 'Nc7!2450';
    this.baseUrl = 'https://hymparhub.com.br';
    this.urlLogin = `${this.baseUrl}/login`;

    this.browser = null;
    this.page = null;
    this.iniciado = false;
    this.carrinhoLocal = new Map();
  }

  async iniciar() {
    try {
      console.log('[Hympar] Iniciando sessão e navegador...');
      const execPath = findChromeExecutable();
      this.browser = await puppeteer.launch({
        headless: true,
        executablePath: execPath,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      this.page = await this.browser.newPage();
      await this.page.setViewport({ width: 1366, height: 768 });
      await this.page.goto(this.urlLogin, { waitUntil: 'networkidle2', timeout: 35000 });

      // Preenche credenciais
      await this.page.waitForSelector('input[name="username"]', { timeout: 10000 });
      await this.page.type('input[name="username"]', this.usuario, { delay: 10 });
      await this.page.type('input[name="password"]', this.senha, { delay: 10 });

      // Verifica se há desafio reCAPTCHA ativo
      const temCaptcha = await this.page.evaluate(() => {
        return !!document.querySelector('iframe[src*="recaptcha"]');
      });

      if (temCaptcha) {
        console.warn('[Hympar] Desafio de segurança reCAPTCHA detectado na tela de login.');
      }

      // Clica em Entrar
      await this.page.evaluate(() => {
        const btn = document.querySelector('button[type="submit"]') || Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').includes('Entrar'));
        if (btn) btn.click();
      });

      await new Promise(r => setTimeout(r, 4000));

      if (this.page.url().includes('/login')) {
        return {
          sucesso: false,
          erro: 'Login no Hympar Hub bloqueado por verificação de segurança (reCAPTCHA Enterprise)'
        };
      }

      this.iniciado = true;
      return { sucesso: true };
    } catch (error) {
      console.error('[Hympar] Erro ao iniciar:', error.message);
      this.iniciado = false;
      return { sucesso: false, erro: error.message };
    }
  }

  async fechar() {
    this.iniciado = false;
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (e) {}
      this.browser = null;
      this.page = null;
    }
    console.log('[Hympar] Sessão encerrada.');
    return { sucesso: true };
  }

  async cotarEAN(ean, descricao = '') {
    if (!this.iniciado) {
      const init = await this.iniciar();
      if (!init.sucesso) {
        return {
          distribuidora: 'HYMPARHUB',
          ean: String(ean || ''),
          disponivel: false,
          preco: null,
          estoque: 0,
          motivo: init.erro || 'Falha de login no Hympar Hub'
        };
      }
    }

    if (!ean) {
      return {
        distribuidora: 'HYMPARHUB',
        ean: '',
        disponivel: false,
        preco: null,
        estoque: 0,
        motivo: 'EAN não informado'
      };
    }

    return {
      distribuidora: 'HYMPARHUB',
      ean: String(ean),
      disponivel: false,
      preco: null,
      estoque: 0,
      motivo: 'Cotação no Hympar Hub requer resolução de desafio reCAPTCHA'
    };
  }

  async adicionarAoCarrinho(ean, quantidade, descricao = '') {
    return { sucesso: false, erro: 'Montagem de carrinho no Hympar requer autenticação sem captcha' };
  }

  async contarItensCarrinho() {
    return this.carrinhoLocal.size;
  }

  async limparCarrinho() {
    this.carrinhoLocal.clear();
    return { sucesso: true, itens: 0 };
  }
}

module.exports = HymparRobot;
