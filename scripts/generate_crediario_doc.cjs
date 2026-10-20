const fs = require('fs');
const path = require('path');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  ShadingType,
  Header,
  Footer,
  PageNumber,
  NumberFormat
} = require(path.join(__dirname, '../backend/node_modules/docx'));

// Definições de Cores BelaFarma
const COLOR_PRIMARY = '0E7490'; // Teal escuro
const COLOR_SECONDARY = '0284C7'; // Azul
const COLOR_DARK = '1E293B'; // Slate dark
const COLOR_LIGHT_BG = 'F1F5F9';
const COLOR_ACCENT = '10B981'; // Esmeralda
const COLOR_BORDER = 'CBD5E1';

function createHeading1(text) {
  return new Paragraph({
    text: text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 120 },
    run: {
      color: COLOR_PRIMARY,
      bold: true,
      size: 28, // 14pt
      font: 'Calibri'
    }
  });
}

function createHeading2(text) {
  return new Paragraph({
    text: text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 80 },
    run: {
      color: COLOR_SECONDARY,
      bold: true,
      size: 24, // 12pt
      font: 'Calibri'
    }
  });
}

function createParagraph(text, options = {}) {
  return new Paragraph({
    spacing: { before: 60, after: 100, line: 276 },
    children: [
      new TextRun({
        text: text,
        size: 22, // 11pt
        font: 'Calibri',
        color: COLOR_DARK,
        ...options
      })
    ]
  });
}

function createBullet(title, description) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { before: 40, after: 60, line: 260 },
    children: [
      new TextRun({
        text: title + ': ',
        bold: true,
        size: 22,
        font: 'Calibri',
        color: COLOR_DARK
      }),
      new TextRun({
        text: description,
        size: 22,
        font: 'Calibri',
        color: '475569'
      })
    ]
  });
}

function createCallout(title, text) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.SINGLE, size: 24, color: COLOR_PRIMARY }
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: 'F8FAFC' },
            margins: { top: 120, bottom: 120, left: 180, right: 180 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: title,
                    bold: true,
                    size: 22,
                    font: 'Calibri',
                    color: COLOR_PRIMARY
                  })
                ],
                spacing: { after: 60 }
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: text,
                    size: 20,
                    font: 'Calibri',
                    color: '334155'
                  })
                ]
              })
            ]
          })
        ]
      })
    ]
  });
}

function createStyledTable(headers, rowsData) {
  const tableRows = [];

  // Cabeçalho
  tableRows.push(
    new TableRow({
      tableHeader: true,
      children: headers.map(h => new TableCell({
        shading: { type: ShadingType.CLEAR, fill: COLOR_PRIMARY },
        margins: { top: 100, bottom: 100, left: 120, right: 120 },
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [
              new TextRun({
                text: h,
                bold: true,
                color: 'FFFFFF',
                size: 20,
                font: 'Calibri'
              })
            ]
          })
        ]
      }))
    })
  );

  // Linhas
  rowsData.forEach((row, rIdx) => {
    tableRows.push(
      new TableRow({
        children: row.map((cellText, cIdx) => new TableCell({
          shading: {
            type: ShadingType.CLEAR,
            fill: rIdx % 2 === 0 ? 'FFFFFF' : COLOR_LIGHT_BG
          },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
            left: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE }
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.LEFT,
              children: [
                new TextRun({
                  text: cellText,
                  size: 19,
                  font: 'Calibri',
                  color: COLOR_DARK
                })
              ]
            })
          ]
        }))
      })
    );
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 8, color: COLOR_PRIMARY },
      bottom: { style: BorderStyle.SINGLE, size: 8, color: COLOR_PRIMARY },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE }
    },
    rows: tableRows
  });
}

async function generateDoc() {
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }
          }
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: 'BELAFARMA | Especificação do Módulo de Crediário & Cartão Próprio',
                    size: 16,
                    color: '94A3B8',
                    font: 'Calibri'
                  })
                ]
              })
            ]
          })
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: 'Página ', size: 16, color: '94A3B8', font: 'Calibri' }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '94A3B8', font: 'Calibri' }),
                  new TextRun({ text: ' de ', size: 16, color: '94A3B8', font: 'Calibri' }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '94A3B8', font: 'Calibri' })
                ]
              })
            ]
          })
        },
        children: [
          // Capa / Cabeçalho Principal
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 100 },
            children: [
              new TextRun({
                text: 'BELAFARMA - SISTEMA DE GESTÃO',
                bold: true,
                size: 26,
                color: COLOR_SECONDARY,
                font: 'Calibri'
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 280 },
            children: [
              new TextRun({
                text: 'ESPECIFICAÇÃO TÉCNICA E FUNCIONAL\nNOVO MÓDULO DE CREDIÁRIO DIGITAL & CARTÃO NFC PRIVATE LABEL',
                bold: true,
                size: 34,
                color: COLOR_PRIMARY,
                font: 'Calibri'
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 400 },
            children: [
              new TextRun({
                text: 'Versão 1.0  |  Data: Outubro/2026  |  Status: Planejamento & Arquitetura',
                italics: true,
                size: 20,
                color: '64748B',
                font: 'Calibri'
              })
            ]
          }),

          createCallout(
            'RESUMO EXECUTIVO DO PROJETO',
            'Este documento estabelece o projeto completo para a criação do ecossistema de Crediário Próprio da Rede BelaFarma. O módulo transforma o crediário tradicional (fichário/caderninho) em um Cartão de Crédito de Bandeira Própria (Private Label), integrando identificação física ultrarrápida por aproximação (NFC), cobrança híbrida (Boleto Bancário e PIX Dinâmico via API Banco Inter), portal web responsivo para o cliente acompanhar faturas e extratos, ciclo de faturamento de até 45 dias para pagar, parcelamento próprio de compras e crédito rotativo com bloqueio de inadimplência 100% automatizado.'
          ),

          new Paragraph({ spacing: { before: 240 } }),

          // Seção 1
          createHeading1('1. Visão Geral e Pilares do Ecossistema'),
          createParagraph('O objetivo do projeto é elevar o crediário a uma ferramenta de retenção de alta fidelidade e receita para a farmácia, reduzindo as perdas por inadimplência e eliminando as tarifas abusivas de maquininhas de cartão de crédito bancárias.'),
          createBullet('Cartão Private Label NFC', 'Cartão físico da BelaFarma com chip NFC/RFID para identificação instantânea no balcão e autorização via senha (PIN) de 4 dígitos.'),
          createBullet('Regra de 45 Dias para Pagar', 'Ciclo de fechamento mensal. Compras efetuadas no "Melhor Dia de Compra" (dia seguinte ao corte) ganham até 45 dias corridos de prazo.'),
          createBullet('Parcelamento Próprio', 'Possibilidade de dividir compras em 2x, 3x ou mais vezes direto no crediário, ocupando o limite total e caindo em faturas futuras.'),
          createBullet('Crédito Rotativo', 'Possibilidade de quitação integral ou pagamento mínimo configurável, rolando o saldo com taxas de juros e multas pré-fixadas.'),
          createBullet('Cobrança Híbrida Automática', 'Boletos registrados com QR Code PIX nativo via API do Banco Inter, emitidos e enviados via WhatsApp (Baileys) com 1 clique.'),
          createBullet('Mini Plataforma do Cliente', 'Ambiente web limpo e mobile-friendly para consulta de extrato, limites, compras por item e quitação via PIX Copia-e-Cola.'),
          createBullet('Motor de Risco & Travamento', 'Bloqueio preventivo e automático no momento da venda por limite excedido ou parcelas atrasadas.'),

          // Seção 2
          createHeading1('2. Cartão de Crédito BelaFarma por NFC'),
          createParagraph('A experiência no balcão da farmácia precisa ser ágil e segura, sem depender de o cliente digitar nome completo ou CPF em voz alta no atendimento.'),
          createHeading2('2.1 Arquitetura de Hardware e Leitura'),
          createBullet('Leitor USB de Mesa (Caixa)', 'Leitor USB NFC (frequência 13.56 MHz, padrão ISO14443A - como ACR122U ou modelos HID Plug & Play). Conecta na porta USB e reconhece o cartão como entrada de teclado ou leitor PC/SC.'),
          createBullet('Cartões e Tags Suportadas', 'Cartões em PVC personalizados com a marca BelaFarma (chips Mifare Classic 1K, Mifare Ultralight ou NTAG213/215). Custo unitário baixo (R$ 1,50 a R$ 3,00 por cartão).'),
          createBullet('Operação em Dispositivos Móveis', 'Para celulares e tablets da equipe no salão de vendas, a leitura funciona via Web NFC nativa no navegador Google Chrome.'),
          
          createHeading2('2.2 Fluxo de Compra e Segurança no PDV'),
          createStyledTable(
            ['Etapa', 'Ação no Caixa / Sistema', 'Tempo Médio'],
            [
              ['1. Aproximação', 'O cliente encosta o cartão no leitor de mesa.', '< 0.5s'],
              ['2. Identificação', 'O sistema localiza o cliente pelo UID e checa status (Ativo / Bloqueado).', 'Instantâneo'],
              ['3. Checagem de Limite', 'Verifica se: Limite Disponível >= Total do Carrinho.', '< 0.2s'],
              ['4. Senha do Cliente', 'O cliente digita sua senha de 4 dígitos (PIN) para autorizar o débito.', '3s'],
              ['5. Conclusão & Saldo', 'A venda é aprovada, o limite é reduzido e o comprovante com saldo sai na impressora térmica.', '1s']
            ]
          ),

          new Paragraph({ spacing: { before: 200 } }),

          // Seção 3
          createHeading1('3. Ciclo Financeiro: 45 Dias, Parcelamento e Rotativo'),
          createParagraph('O sistema adota o mesmo modelo das principais administradoras de cartão de crédito do mercado, garantindo clareza total tanto para o cliente quanto para o caixa.'),

          createHeading2('3.1 A Lógica dos 45 Dias para Pagar'),
          createParagraph('O mês é dividido em duas datas fixas por grupo de clientes:'),
          createBullet('Dia de Fechamento (Corte da Fatura)', 'Exemplo: Dia 20 de cada mês. Todas as compras até as 23:59 do dia 20 entram na fatura corrente.'),
          createBullet('Dia de Vencimento', 'Exemplo: Dia 05 do mês subsequente (15 dias após o fechamento).'),
          createBullet('O Melhor Dia de Compra', 'Uma compra feita no Dia 21 (logo após o corte) só entrará na fatura do mês seguinte (fechamento no dia 20 próximo) e só vencerá no dia 05 subsequente. Totalizando 45 dias de fôlego financeiro para o cliente!'),

          createHeading2('3.2 Parcelamento Próprio de Compras'),
          createParagraph('Nas compras acima de determinado valor, o atendente pode ofertar parcelamento (ex: 1x a 6x):'),
          createBullet('Alocação das Parcelas', 'A 1ª parcela entra na fatura atual; as parcelas seguintes são lançadas com status de faturas futuras (projeção).'),
          createBullet('Comprometimento do Limite', 'O valor integral da compra reduz imediatamente o limite disponível, liberando o crédito mês a mês conforme as parcelas são pagas.'),

          createHeading2('3.3 Crédito Rotativo'),
          createParagraph('Caso o cliente não consiga quitar o valor total da fatura até o vencimento:'),
          createBullet('Pagamento Mínimo', 'Configurável pela BelaFarma (ex: 25% a 30% do total da fatura). Quitando o mínimo, o cartão NÃO é bloqueado.'),
          createBullet('Rolagem do Saldo', 'O saldo remanescente é transferido para a fatura seguinte com acréscimo de juros rotativos e multa por atraso (previamente acordados no contrato do crediário).'),

          // Seção 4
          createHeading1('4. Emissão e Envio de Boletos & PIX Automático'),
          createParagraph('O BelaFarma já conta com os certificados e chaves de integração bancária configurados na pasta bancoInter/. A integração com a API v3 de Cobrança do Banco Inter permite emissão a custo zero ou ultra reduzido.'),
          createBullet('Boleto Híbrido', 'Gera simultaneamente a Linha Digitável tradicional com código de barras e o QR Code PIX dinâmico impresso no próprio documento.'),
          createBullet('Conciliação Automática via Webhook', 'Assim que o cliente efetua o pagamento pelo aplicativo de qualquer banco (seja via PIX ou Boleto), a API do Inter notifica o servidor do BelaFarma em tempo real. O sistema baixa a fatura e libera o limite do cliente no mesmo segundo!'),
          createBullet('Régua de Envio pelo WhatsApp', 'Integração direta com o Baileys do BelaFarma: 5 dias antes e no dia do vencimento, o cliente recebe uma mensagem amigável com a chave PIX Copia-e-Cola e o arquivo do boleto em anexo.'),

          // Seção 5
          createHeading1('5. Mini Plataforma do Cliente (Portal Web / PWA)'),
          createParagraph('Uma página web leve, moderna e segura, acessível pelo navegador do celular do cliente sem necessidade de baixar aplicativos pesados da loja.'),
          createHeading2('5.1 Telas e Funcionalidades do Portal'),
          createBullet('Autenticação Prática', 'Login por CPF + Data de Nascimento com envio de código de segurança (OTP) de 4 dígitos via WhatsApp do cliente.'),
          createBullet('Card do Cartão Virtual', 'Visualização do cartão estilizado com limite total, limite gasto e limite disponível em tempo real.'),
          createBullet('Extrato Detalhado', 'Listagem transparente de cada compra realizada no balcão com data, hora, atendente e itens de medicamentos ou perfumaria adquiridos.'),
          createBullet('Faturas & Segunda Via', 'Acesso às faturas Fechadas, Abertas e Histórico de Quitadas.'),
          createBullet('Área de Pagamento PIX', 'Botão destacado "PAGAR FATURA COM PIX". Ao clicar, gera o QR Code e o botão de 1 clique "Copiar Código PIX", além de link para download do boleto em PDF.'),

          // Seção 6
          createHeading1('6. Motor de Risco e Políticas de Bloqueio'),
          createStyledTable(
            ['Condição Identificada', 'Ação do Sistema', 'Desbloqueio'],
            [
              ['Compra > Limite Disponível', 'Transação recusada no caixa por "Limite Insuficiente".', 'Disponível assim que houver quitação de faturas.'],
              ['Fatura vencida há > 1 dia', 'Alerta amarelo no caixa. Cartão entra em aviso prévio.', 'Quitação de encargos atrasados.'],
              ['Fatura vencida há > 5 dias', 'Cartão bloqueado 100% para novas compras em todos os caixas.', 'Baixa automática via PIX ou no caixa da loja.'],
              ['Tentativas de senha incorreta (3x)', 'Cartão bloqueado preventivamente por segurança.', 'Desbloqueio com gerente na loja ou confirmação por WhatsApp.']
            ]
          ),

          new Paragraph({ spacing: { before: 200 } }),

          // Seção 7
          createHeading1('7. Modelagem de Dados no Backend'),
          createParagraph('Abaixo, as principais entidades que serão adicionadas ao banco de dados SQLite local ultra-rápido do BelaFarma:'),
          createBullet('crediario_clientes_config', 'Armazena limite aprovado, limite utilizado, status (ATIVO/BLOQUEADO), dia de corte e dia de vencimento.'),
          createBullet('crediario_cartoes_nfc', 'Guarda o UID da tag física, hash da senha de 4 dígitos (bcrypt), status do cartão e histórico de emissões.'),
          createBullet('crediario_faturas', 'Controle mensal da fatura com valor total, mínimo, valor pago, saldo rotativo, link do boleto e cópia-e-cola PIX.'),
          createBullet('crediario_parcelas', 'Detalhamento de cada compra parcelada com número da parcela, valor e vencimento previsto.'),
          createBullet('crediario_transacoes', 'Log imutável de todas as compras, estornos e pagamentos para auditoria fiscal e financeira.'),

          // Seção 8
          createHeading1('8. Cronograma e Etapas de Execução'),
          createStyledTable(
            ['Fase', 'Módulo / Escopo', 'Entrega Principal'],
            [
              ['Fase 1', 'Engenharia de Banco & Motor de Limites', 'Tabelas, regras de 45 dias, cálculo de faturas e simulação de rotativo.'],
              ['Fase 2', 'Integração Banco Inter (Boletos + PIX)', 'Geração de boletos híbridos com QR Code PIX e Webhook de conciliação.'],
              ['Fase 3', 'Módulo de Cartão NFC no Caixa', 'Cadastro de tags NFC, tela de autorização rápida com senha no PDV.'],
              ['Fase 4', 'Mini Plataforma do Cliente & WhatsApp', 'Portal web do cliente e envio automático de faturas e código PIX.']
            ]
          ),

          new Paragraph({ spacing: { before: 260 } }),
          createCallout(
            'CONCLUSÃO DA VIABILIDADE',
            'O projeto é plenamente viável dentro da estrutura atual da Rede BelaFarma. Além de viável, coloca a BelaFarma em posição pioneira no varejo farmacêutico da região, aumentando a fidelização de famílias, gerando receita com o rotativo e zerando a inadimplência através do bloqueio automático rigoroso.'
          )
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  const outputPath = path.join(__dirname, '../Modulo_Crediario_BelaFarma.docx');
  fs.writeFileSync(outputPath, buffer);
  console.log('Documento gerado com sucesso em:', outputPath);
}

generateDoc().catch(err => {
  console.error('Erro ao gerar documento:', err);
  process.exit(1);
});
