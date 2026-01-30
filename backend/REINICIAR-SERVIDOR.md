# 🔧 Como Reiniciar o Servidor Backend

## Problema Identificado

O banco de dados de produção foi copiado corretamente para `backend/belafarma.db`, mas o servidor backend precisa ser reiniciado para carregar os novos dados.

## ✅ Solução: Reiniciar o Servidor Backend

### Passo 1: Parar o Servidor

No terminal onde está rodando `npm run dev` do backend:

1. Pressione `Ctrl+C`
2. Aguarde a mensagem de confirmação

### Passo 2: Reiniciar o Servidor

Execute novamente:

```bash
npm run dev
```

### Passo 3: Verificar os Logs

Ao iniciar, você deve ver mensagens como:

```
Conexão com o banco de dados SQLite estabelecida: F:\Documentos\Desenvolvimento\BelaFarma\backend\belafarma.db
PRAGMA journal_mode = WAL
Tabelas verificadas/criadas com sucesso.
```

### Passo 4: Limpar Cache do Navegador

1. Abra o navegador onde a aplicação está rodando
2. Pressione `Ctrl+Shift+R` (Windows) ou `Cmd+Shift+R` (Mac)
3. Ou use `Ctrl+Shift+Del` e limpe o cache

### Passo 5: Fazer Login Novamente

1. Acesse `http://localhost:5173`
2. Faça login com suas credenciais
3. Os dados de produção devem aparecer!

## 📊 Dados Esperados

Após reiniciar, você deve ver:

- **3 usuários**: Edevaldo Cruz, op1, Nayane
- **30 fechamentos de caixa**
- **23 lançamentos diários**
- **8 boletos**
- **2 clientes**

## 🔍 Verificação Rápida

Para confirmar que o backend está usando o banco correto, execute no terminal do backend:

```bash
node test-db.js
```

Você deve ver a lista dos 3 usuários cadastrados.

## ⚠️ Se os Dados Ainda Não Aparecerem

1. **Verifique o Console do Navegador** (F12 → Console)
   - Procure por erros em vermelho
   - Verifique se há erros de rede

2. **Verifique se o servidor está na porta correta**
   ```bash
   curl http://localhost:3001/api/all-data
   ```
   Deve retornar dados JSON

3. **Limpe o localStorage**
   - Abra o Console (F12)
   - Digite: `localStorage.clear()`
   - Recarregue a página

## 📁 Arquivos do Banco de Dados

- **Localização**: `backend/belafarma.db`
- **Tamanho**: ~88KB (com dados de produção)
- **Arquivos WAL**: `backend/belafarma.db-shm` e `backend/belafarma.db-wal`

## ✅ Confirmação

Você saberá que funcionou quando:

1. O servidor backend iniciar sem erros
2. O teste `node test-db.js` mostrar 3 usuários
3. O frontend exibir os dados de produção após o login
