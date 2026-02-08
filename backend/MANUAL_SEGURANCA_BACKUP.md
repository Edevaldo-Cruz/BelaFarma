# 🛡️ Manual de Segurança e Backup - Bela Farma

Este documento contém instruções para configurar o backup automatizado e explica as correções realizadas no sistema do Cofre.

## 1. Correção do Bug no Cofre (Fechamento de Caixa)

### 🔍 Diagnóstico
O problema de "retirada não salva" durante o fechamento de caixa pode ocorrer por três motivos principais:
1.  **Tabela `safe_entries` inexistente:** Se o banco de dados foi migrado ou restaurado de uma versão antiga sem essa tabela.
2.  **Coluna `userName` faltando:** O código tentava inserir o nome do usuário, mas a tabela antiga não possuía essa coluna, causando falha silenciosa ou erro interno.
3.  **Valor Zero:** Se o valor enviado fosse interpretado como zero.

### ✅ Correções Realizadas
1.  **Criação Automática da Tabela:** Adicionei o comando `CREATE TABLE IF NOT EXISTS safe_entries` na inicialização do sistema.
2.  **Garantia de Colunas:** Adicionei um script que verifica se a coluna `userName` existe e a adiciona automaticamente se necessário (`ALTER TABLE`).
3.  **Logs de Depuração:** Adicionei logs detalhados no backend (`[CASH CLOSING DEBUG]`) para mostrar exatamente qual valor está chegando do fechamento de caixa.

**Como Testar:**
-   Reinicie o backend (`npm run dev` na pasta backend).
-   Faça um fechamento de caixa com retirada para o cofre.
-   Verifique o console do backend. Você deve ver mensagens como:
    -   `[CASH CLOSING DEBUG] safeDeposit raw: 150, parsed: 150`
    -   `[CASH CLOSING] Registering safe deposit: R$ 150`

---

## 2. Script de Backup Automatizado (Local + Google Drive)

O script de backup foi criado em `backend/backup-script.js`. Ele realiza:
1.  Cópia do banco de dados local para a pasta `backend/backups/`.
2.  Upload do arquivo para o Google Drive (se configurado).
3.  Limpeza de backups locais mais antigos que 30 dias.

### 🚀 Como Configurar e Usar

#### Passo 1: Instalar Dependência
No terminal, dentro da pasta `backend`, execute:
```bash
npm install googleapis
```

#### Passo 2: Configurar Google Drive (Opcional)
Para que o backup vá para a nuvem, você precisa de credenciais do Google.

1.  Acesse o [Google Cloud Console](https://console.cloud.google.com/).
2.  Crie um projeto e habilite a **Google Drive API**.
3.  Vá em **Credentials** -> **Create Credentials** -> **OAuth Client ID** (tipo Desktop App).
4.  Baixe o arquivo JSON e salve-o na pasta `backend` com o nome `credentials.json`.
5.  Execute o script pela primeira vez (pode pedir autorização via navegador se implementarmos o fluxo completo, ou você pode gerar o token separadamente).
    *   *Nota:* O script atual espera um arquivo `token.json` já autorizado para rodar 100% automatizado sem intervenção humana. Para gerar esse token na primeira vez, seria necessário um pequeno script auxiliar de autenticação.

#### Passo 3: Executar o Backup
Para rodar o backup manualmente:
```bash
node backup-script.js
```

Para automatizar (ex: todo dia às 23:00), você pode usar o **Agendador de Tarefas do Windows**:
1.  Crie uma nova tarefa básica.
2.  Disparador: Diariamente às 23:00.
3.  Ação: Iniciar programa.
    -   Programa: `node` (caminho completo para o executável do node, ex: `C:\Program Files\nodejs\node.exe`)
    -   Argumentos: `f:\Documentos\Desenvolvimento\BelaFarma\backend\backup-script.js`
    -   Iniciar em: `f:\Documentos\Desenvolvimento\BelaFarma\backend`

### 📝 Checklist de Verificação
- [ ] A pasta `backups` foi criada dentro de `backend`?
- [ ] O arquivo de backup tem o nome com data/hora correta (ex: `backup_2023-10-27-230000.db`)?
- [ ] (Se configurado) O arquivo apareceu na pasta do Google Drive?
- [ ] Arquivos muito antigos estão sendo apagados?
