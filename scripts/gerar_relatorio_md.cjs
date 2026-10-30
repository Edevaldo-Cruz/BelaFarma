const fs = require('fs');
const path = require('path');
const jsonPath = path.join(__dirname, '..', 'scratch', 'relatorio_restauracao_101_produtos.json');
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

let md = '# Relatório de Auditoria e Restauração de Preços (Digifarma)\n\n';
md += '> [!NOTE]\n';
md += '> Todos os valores foram consultados no backup oficial do Digifarma de **16/09/2026 às 07:27** (`bkp_precos_16092026_072709.fdb`) e restaurados diretamente no banco de dados Firebird em produção (`digifarma6.fdb`).\n\n';
md += '### 📊 Resumo Executivo\n';
md += '- **Total de produtos auditados:** ' + data.length + ' produtos\n';
md += '- **Produtos que utilizavam PROD_PRPROMOCAO como preço habitual de venda:** 72\n';
md += '- **Produtos restaurados no Firebird:** 71 produtos (1 produto já estava ativo com promoção)\n';
md += '- **Produtos sem promoção prévia (preço de tabela integral mantido):** 28 produtos\n';
md += '- **Produtos novos (cadastrados após 16/09):** 1 produto (`#189265` - Bruma Matte Miss Rose)\n\n';
md += '### 🔍 Diagnóstico do Problema que Ocorreu\n';
md += 'No sistema Digifarma, muitos produtos possuem um **Preço de Venda Base (`PROD_PRVENDA`) inflacionado** (como preço máximo sugerido pelo laboratório/PMC), e o preço real de venda praticado no balcão e no caixa é mantido no campo **`PROD_PRPROMOCAO`**.\n\n';
md += 'Ao rodar o comando de reset anterior com `PROD_PRPROMOCAO = 0`, o caixa do Digifarma passou a cobrar o preço cheio da tabela base (por exemplo: Bepantriz Derma saltou de **R$ 18,99** para **R$ 64,75**; Acnezil Sabonete de **R$ 24,99** para **R$ 79,35**).\n\n';
md += 'Todos os 71 produtos tiveram seus campos `PROD_PRPROMOCAO`, `INICIO_PROMOCAO` e `TERMINO_PROMOCAO` reestabelecidos com os valores exatos do backup de 16/09/2026, restabelecendo o preço de venda anterior à liquidação.\n\n';
md += '### 📋 Tabela Comparativa Completa\n\n';
md += '| ID | Descrição | Preço Tabela Base | Preço Original Balcão (Backup) | Status Antes da Correção | Preço Restaurado no Digifarma |\n';
md += '|:---|:---|:---:|:---:|:---:|:---:|\n';

data.sort((a,b) => a.descricao.localeCompare(b.descricao)).forEach(item => {
  const precoTabela = 'R$ ' + item.preco_tabela.toFixed(2).replace('.', ',');
  const precoOriginal = 'R$ ' + item.preco_real_praticado.toFixed(2).replace('.', ',');
  md += `| \`${item.id}\` | ${item.descricao} | ${precoTabela} | **${precoOriginal}** | ${item.status_no_digifarma_antes} | **${item.restaurado_para}** |\n`;
});

const artPath = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\e28373de-a8c6-4189-b698-704b3a103768\\relatorio_restauracao_precos_backup.md';
fs.writeFileSync(artPath, md, 'utf8');
console.log('Artifact criado com sucesso em:', artPath);
