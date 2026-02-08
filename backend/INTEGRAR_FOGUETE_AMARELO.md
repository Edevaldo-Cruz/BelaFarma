# Instruções para Integrar os Endpoints Foguete Amarelo

## Passo a Passo

1. Abra o arquivo: `backend/server.js`

2. Localize a linha 2087-2090 que contém:
```javascript
});


app.listen(PORT, () => {
```

3. Substitua por:
```javascript
});

// ============================================================================
// SISTEMA FOGUETE AMARELO - Inicialização dos Endpoints
// ============================================================================
const { initializeFogueteAmareloEndpoints } = require('./foguete-amarelo-endpoints.js');
initializeFogueteAmareloEndpoints(app, db);

app.listen(PORT, () => {
```

4. Salve o arquivo

5. Reinicie o servidor backend (Ctrl+C no terminal e rode novamente `node server.js`)

## Verificação

Após reiniciar, você deve ver no console:
```
🚀 Inicializando endpoints do Sistema Foguete Amarelo...
✅ Endpoints do Sistema Foguete Amarelo inicializados!
```

## Endpoints Disponíveis

Após a integração, os seguintes endpoints estarão disponíveis:

- `POST /api/invoices` - Cadastrar nota fiscal
- `GET /api/invoices` - Listar notas fiscais  
- `GET /api/foguete-amarelo/dashboard` - Dashboard de monitoramento
- `POST /api/sales` - Registrar venda (com lógica Foguete Amarelo)

## Teste Rápido

Você pode testar se os endpoints estão funcionando com:

```bash
curl http://localhost:3001/api/invoices
```

Deve retornar um array vazio `[]` (pois ainda não há notas cadastradas).
