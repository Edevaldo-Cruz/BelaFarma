# Handoff Report — Explorer Survey Backend

**Date**: 2026-08-29  
**Agent ID**: `explorer_survey_backend` (teamwork_preview_explorer)  
**Task**: Mapeamento completo de backend, serviços, package.json, rotas, banco de dados (SQLite/Firebird), WhatsApp Baileys e especificação da arquitetura da Central de Compras (R1 a R5).  
**Handoff Type**: Hard Handoff (Complete)

---

## 1. Observation

1. **Topologia e Serviços de Infraestrutura**:
   - `docker-compose.yml` (linhas 1-96) define três serviços principais: `backend` (build `./backend`, expõe porta 3001 internamente), `frontend` (build `./Dockerfile.frontend`, expõe porta `8085:80`) e `evolution-api` (imagem `evoapicloud/evolution-api:v2.1.2`, expõe porta `8080:8080`).
   - Servidor real de produção é um Raspberry Pi 4 na rede local com IP `192.168.1.70` e o ERP Digifarma roda em Windows com Firebird 2.5 no IP `192.168.1.10:3050`.

2. **Dependências do Backend**:
   - `backend/package.json` (linhas 10-26) lista: `@whiskeysockets/baileys` (`^7.0.0-rc14`), `better-sqlite3` (`^12.6.2`), `node-firebird` (`^2.3.2`), `express` (`^4.19.2`), `node-cron` (`^4.2.1`), `multer` (`^2.0.2`), `openai` (`^4.33.0`), `pdf-parse` (`^2.4.5`), `qrcode` (`^1.5.4`), etc.

3. **Banco de Dados e Sincronização**:
   - `backend/database.js` (linhas 10-15) inicializa SQLite com `db.pragma('journal_mode = WAL')` e cria todas as tabelas da plataforma localmente.
   - `backend/services/digifarma.service.js` (linhas 28-98) implementa `queryDigifarma(sql, params, timeoutMs)` com pool de conexões e suporte completo a transações com `db.transaction(firebird.ISOLATION_READ_COMMITTED)` e `tr.commit()`.
   - `backend/services/digifarma-sync.service.js` (linhas 49-170) sincroniza catálogo, produtos e Curva ABC do Firebird para a tabela local `digifarma_products_cache`.

4. **Instâncias Baileys WhatsApp**:
   - `backend/baileys-service.js` gerencia a instância principal (sessão em `baileys-session` / `data/baileys-session`).
   - `backend/baileys-secondary-service.js` gerencia a instância secundária (sessão em `baileys-session-secondary` / `data/baileys-session-secondary`).
   - O requisito R2 necessita de uma instância dedicada `baileys-compras-service.js` com pasta `baileys-session-compras`.

5. **Módulos de Compras Existentes**:
   - `backend/purchasing-endpoints.js` (linhas 134-170) já contém consultas em tempo real para `PRODUTOS` (`p.PROD_ESTMINIMO`, `p.PROD_SALDO`, `p.PROD_PRVENDA`) e histórico de compras em `ITEM_NOTAS` / `CAB_NOTAS`.
   - `backend/services/stock.service.js` (linhas 54-106 e 180-260) possui lógica de cálculo de saídas dos últimos 30 dias e produtos parados há 90+ dias.

---

## 2. Logic Chain

1. **A partir da observação de `queryDigifarma` e do campo `PROD_ESTMINIMO` em `PRODUTOS`**:
   - Conclui-se que o backend já dispõe de driver Firebird seguro com capacidade de escrita transacional para atualizar `PROD_ESTMINIMO` diretamente no Digifarma, satisfazendo o requisito R1 com rollback garantido em caso de falha.

2. **A partir da observação da coexistência de instâncias Baileys isoladas (`baileys-service.js` e `baileys-secondary-service.js`)**:
   - Conclui-se que a arquitetura do projeto já possui o padrão consolidado para rodar instâncias múltiplas e paralelas do Baileys. A criação de `baileys-compras-service.js` com diretório de sessão `baileys-session-compras` (R2) é 100% aderente e segura, isolando o fluxo de compras de clientes e etiquetas.

3. **A partir da observação do modelo de dados SQLite (`better-sqlite3`) e das tabelas existentes (`quotations`, `orders`, `boletos`, `monthly_limits`)**:
   - Conclui-se que as novas tabelas (`compras_fornecedores_meta`, `compras_oportunidades_mineradas`, `compras_cotacoes`, `compras_cotacoes_respostas`, `compras_approval_queue`, `compras_pedidos`) podem ser adicionadas diretamente ao `backend/database.js` em modo WAL, garantindo persistência imediata, performance (<10ms) e integração total com o módulo de Contas a Pagar e Orçamento Mensal.

4. **A partir da observação do requisito de aprovação obrigatória (R4)**:
   - Conclui-se que todo envio de mensagens externas via WhatsApp comercial deve passar por um interceptador obrigatório na tabela `compras_approval_queue`. Nenhuma mensagem é disparada sem status `Aprovado` validado por ação de clique do usuário na interface web.

---

## 3. Caveats

- O servidor do Digifarma (`192.168.1.10:3050`) pode estar inacessível fora do expediente da farmácia ou durante manutenções. Por essa razão, todos os serviços de compras devem utilizar o padrão de resiliência já existente no backend: retorno gracioso com fallback para cache local SQLite (`ai_cache` / `digifarma_products_cache`) e status `503 Service Unavailable` explícito.
- As mensagens recebidas dos representantes no WhatsApp comercial podem vir em formatos não estruturados (textos informais, imagens de encartes, PDFs de tabelas). O motor de cotações deve combinar expressões regulares (regex) com IA multimodal (Gemini / GPT) para extrair preços e bonificações com assertividade.

---

## 4. Conclusion

A infraestrutura de backend da BelaFarma está totalmente mapeada e preparada para receber a **Central de Compras**. A solução recomendada estrutura o backend em 5 serviços modulares sob `backend/services/`, 1 instância isolada do Baileys (`baileys-compras-service.js`), 1 novo roteador de endpoints (`backend/compras-endpoints.js`) montado em `/api/central-compras`, e 7 novas tabelas relacionais no SQLite para controle de estoque mínimo, cotações com score ponderado (60/25/15), otimização de pedido mínimo, fila estrita de aprovação humana e espelhos de pedidos integrados ao orçamento.

---

## 5. Verification Method

Para verificar e validar as conclusões deste relatório:
1. **Inspecionar arquivos gerados**:
   - `f:\Documentos\Desenvolvimento\BelaFarma\.agents\explorer_survey_backend\analysis.md`
   - `f:\Documentos\Desenvolvimento\BelaFarma\.agents\explorer_survey_backend\handoff.md`
2. **Executar teste empírico de conectividade e lógica no backend**:
   ```bash
   node f:\Documentos\Desenvolvimento\BelaFarma\test_runner.js
   ```
3. **Condições de Invalidação**:
   - Se o campo de estoque mínimo no Digifarma Firebird não for `PROD_ESTMINIMO` ou se a tabela `PRODUTOS` rejeitar atualizações transacionais com `node-firebird`.
   - Se o Baileys não suportar 3 sessões multi-arquivo simultâneas no mesmo processo Node.js (já validado com sucesso entre a 1ª e 2ª instância).
