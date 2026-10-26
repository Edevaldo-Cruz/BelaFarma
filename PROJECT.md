# Project: Belinha Compras

Especialista autônoma em inteligência de compras e suprimentos da BelaFarma integrada ao WhatsApp Compras e ao motor de cotações BelaPed.

## Architecture

O sistema opera com um pipeline de ingestão e extração comercial de alta precisão para mensagens e mídias recebidas no WhatsApp Compras:

```
                  ┌──────────────────────────────┐
                  │    WhatsApp Compras (Baileys) │
                  │ (baileys-compras-service.js) │
                  └──────────────┬───────────────┘
                                 │
           ┌─────────────────────┴─────────────────────┐
           ▼                                           ▼
   [Mensagem de Texto]                        [imageMessage Buffer]
           │                                           │
           │                                 ┌─────────┴─────────┐
           │                                 │ downloadMedia-    │
           │                                 │ Message (Baileys) │
           │                                 └─────────┬─────────┘
           │                                           │
           ▼                                           ▼
┌─────────────────────────────────────────────────────────────┐
│             Belinha Compras Extraction Engine               │
│        (backend/services/belinha-compras.service.js)        │
│                                                             │
│  1. Filtro Heurístico Anti-Ruído ("bom dia", comprovante)   │
│  2. Multimodal Gemini Vision / Flash com JSON Estrito       │
│  3. Fallback Heurístico / Regex Determinístico (Resiliência)│
│  4. Validações Estritas: EAN-13, BRL Decimal, OCR Conf.     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Persistence & Linking                    │
│                                                             │
│  1. compras_historico_mensagens (Raw + Resultado JSON)      │
│  2. compras_fornecedores_meta (Distribuidora / Rep / Prazos)│
│  3. compras_oportunidades_mineradas (Oportunidades Salvas)  │
│  4. Enriquecimento / Waterfall com Catálogo Digifarma       │
│  5. Upsert atômico em belaped_cotacoes_reais                │
│     -> Alimenta Radar de Compras & Otimização do BelaPed    │
└─────────────────────────────────────────────────────────────┘
```

## Feature Inventory

| # | Feature | Description | Milestone | Source | Status |
|---|---------|-------------|-----------|--------|--------|
| 1 | Classificação Comercial | Identifica `ehOfertaComercial: boolean` e descarta ruídos/saudações | M1 | ORIGINAL_REQUEST R1 | DONE |
| 2 | Fornecedor: Distribuidora | Extração e normalização de distribuidora/indústria farmacêutica | M1 | ORIGINAL_REQUEST R1 | DONE |
| 3 | Fornecedor: Representante | Extração de vendedor/representante via texto falado e pushName | M1 | ORIGINAL_REQUEST R1 | DONE |
| 4 | Fornecedor: Condições | Captura prazos de pagamento (`28/42 dias`, `À vista`, `PIX`) | M1 | ORIGINAL_REQUEST R1 | DONE |
| 5 | Fornecedor: Pedido Mínimo | Extração de valor mínimo de pedido em R$ | M1 | ORIGINAL_REQUEST R1 | DONE |
| 6 | Fornecedor: Validade | Captura de vigência da promoção no padrão `YYYY-MM-DD` ou original | M1 | ORIGINAL_REQUEST R1 | DONE |
| 7 | Produto: Nome Completo | Extração de nome comercial com dosagem/apresentação sem preço embutido | M1 | ORIGINAL_REQUEST R1 | DONE |
| 8 | Produto: Validação EAN-13 | Extração com validação estrita de 13 dígitos numéricos e dígito verificador | M1 | ORIGINAL_REQUEST R1/R4 | DONE |
| 9 | Produto: Laboratório | Identificação de laboratório ou inferência via prefixo GS1 Brasil | M1 | ORIGINAL_REQUEST R1 | DONE |
| 10 | Produto: Preço Líquido | Conversão precisa de preço em R$ (float líquido) sem perdas decimais | M1 | ORIGINAL_REQUEST R1/R4 | DONE |
| 11 | Produto: Apresentação/Unidade | Identificação de unidade de faturamento (`cx`, `un`, `frasco`) | M1 | ORIGINAL_REQUEST R1 | DONE |
| 12 | Produto: Bonificações | Diluição matemática de bonificação (`Compre 10 Leve 2`) no preço unitário | M1 | ORIGINAL_REQUEST R1 | DONE |
| 13 | Produto: Descontos Progressivos | Captura de faixas escalonadas de preço por quantidade | M1 | ORIGINAL_REQUEST R1 | DONE |
| 14 | Ingestão Baileys ImageMessage | Correção de detecção de mídia no Baileys desempacotando `messageContextInfo` | M2 | ORIGINAL_REQUEST R2 | DONE |
| 15 | Download Buffer Baileys | Download resiliente via `downloadMediaMessage` com headers e fallback | M2 | ORIGINAL_REQUEST R2 | DONE |
| 16 | Multimodal Vision Gemini | Chamada única direta Gemini Vision com `inlineData` e `application/json` | M2 | ORIGINAL_REQUEST R2 | DONE |
| 17 | Score de Confiança OCR | Cálculo e retorno de `confiancaOcr` numérico entre 0.0 e 1.0 em imagens | M2 | ORIGINAL_REQUEST R2/R4 | DONE |
| 18 | Correção Modelo Gemini AI | Atualização do modelo padrão em `ai.service.js` para modelo suportado | M2 | Survey Explorer 1 | DONE |
| 19 | Persistência Oportunidades | Gravação atômica em `compras_oportunidades_mineradas` com campos enriquecidos | M3 | ORIGINAL_REQUEST R3 | DONE |
| 20 | Histórico WhatsApp | Gravação do payload JSON estrito em `compras_historico_mensagens` | M3 | ORIGINAL_REQUEST R3 | DONE |
| 21 | Waterfall Catálogo Digifarma | Enriquecimento por EAN-13 e descrição contra caches do Digifarma | M3 | ORIGINAL_REQUEST R3 | DONE |
| 22 | Integração Radar BelaPed | Upsert atômico direto em `belaped_cotacoes_reais` para alimentar cotações | M3 | ORIGINAL_REQUEST R3 | DONE |
| 23 | Suíte de Testes E2E | Bateria automatizada com fixtures de texto, imagem, ruído e edge cases | M4 | ORIGINAL_REQUEST R4 | DONE |
| 24 | Hardening Adversarial | Validação de 20 edge cases, travas de sanidade e integridade forense | M_FINAL | Project Guidelines | DONE |

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Motor de Extração & Schema Estrito | Implementar `backend/services/belinha-compras.service.js` com JSON Schema estrito, prompts especializados, anti-ruído, parser BRL, validação EAN-13 e fallback determinístico | none | DONE |
| M2 | Pipeline Multimodal WhatsApp & Gemini | Ajustar `backend/baileys-compras-service.js` e `backend/services/ai.service.js` para download de buffer, modelo Gemini suportado, single-pass vision e extração de imagens | M1 | DONE |
| M3 | Persistência & Radar BelaPed | Persistir oportunidades no SQLite, atualizar histórico de mensagens, executar waterfall de catálogo e upsert em `belaped_cotacoes_reais` | M1, M2 | DONE |
| M4 | Suíte de Testes & Fixtures | Implementar runner E2E `backend/test_belinha_compras_suite.js` cobrindo Tiers 1 a 4 com fixtures reais e sintéticas | M1, M2, M3 | DONE |
| M_FINAL | Final Milestone E2E & Hardening | Validação 100% E2E de todos os tiers + auditoria forense de integridade + adversarial hardening | M1, M2, M3, M4 | DONE |

## Interface Contracts

### Belinha Compras Service Contract
```typescript
interface FornecedorExtraido {
  distribuidora: string | null;
  representante: string | null;
  condicaoPagamento: string | null;
  pedidoMinimo: number | null;
  validadeOferta: string | null;
}

interface ProdutoOfertadoExtraido {
  nomeComercial: string;
  ean: string | null;
  laboratorio: string | null;
  precoOfertado: number;
  unidade: string | null;
  bonificacao: string | null;
  descontoProgressivo: string | null;
  confiancaOcr: number | null;
}

interface BelinhaExtracaoResult {
  sucesso: boolean;
  ehOfertaComercial: boolean;
  fornecedor: FornecedorExtraido;
  produtosOfertados: ProdutoOfertadoExtraido[];
}

// Service Method
function processarMensagemComercial(params: {
  text?: string;
  buffer?: Buffer;
  mimeType?: string;
  pushName?: string;
  phone?: string;
  db?: any;
}): Promise<BelinhaExtracaoResult>;
```

### BelaPed Integration Contract (`belaped_cotacoes_reais`)
```sql
INSERT INTO belaped_cotacoes_reais (
  ean, fornecedor, preco, disponivel, descricao, updated_at,
  condicao_comercial, preco_padrao, laboratorio
) VALUES (
  @ean, @fornecedor, @preco, 1, @descricao, datetime('now', 'localtime'),
  @condicao, @preco, @laboratorio
) ON CONFLICT(ean, fornecedor) DO UPDATE SET
  preco = excluded.preco,
  descricao = excluded.descricao,
  updated_at = excluded.updated_at,
  condicao_comercial = excluded.condicao_comercial,
  laboratorio = excluded.laboratorio;
```

## Code Layout

- `backend/services/belinha-compras.service.js` (Novo módulo especialista com exportações limpas)
- `backend/baileys-compras-service.js` (Ajuste no desempacotamento de mensagens e hook multimodal)
- `backend/services/ai.service.js` (Ajuste de modelo Gemini suportado e responseMimeType)
- `backend/services/compras-mineracao.service.js` (Integração e compatibilidade retroativa)
- `backend/test_belinha_compras_suite.js` (Suíte E2E automatizada com fixtures completas)
- `backend/fixtures/belinha_compras_fixtures.json` (Fixtures de teste para validação de mercado)
