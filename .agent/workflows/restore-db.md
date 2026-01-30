---
description: Restaurar banco de dados de produção
---

# Workflow: Restaurar Banco de Dados de Produção

Este workflow descreve como restaurar o banco de dados de produção no ambiente de desenvolvimento local.

## Pré-requisitos
- Acesso SSH ao servidor de produção (192.168.1.9)
- Senha do usuário `ed`: 2494
- Servidor backend parado ou pronto para reiniciar

## Passos

### 1. Fazer backup do banco atual
```bash
cd f:\Documentos\Desenvolvimento\BelaFarma\backend
cp belafarma.db belafarma.db.backup.$(date +%Y%m%d_%H%M%S)
```

### 2. Abrir um novo terminal
Abra um novo terminal (Git Bash ou terminal do VS Code) para ter controle visual do processo.

### 3. Copiar banco de produção via SCP
```bash
cd f:\Documentos\Desenvolvimento\BelaFarma
scp ed@192.168.1.9:/home/ed/projetcs/BelaFarma/backend/belafarma.db ./backend/banco-producao.db
```
**Quando solicitado, digite a senha:** `2494`

### 4. Verificar se o arquivo foi copiado
```bash
ls -lh backend/banco-producao.db
```

### 5. Substituir o banco local
```bash
cp backend/banco-producao.db backend/belafarma.db
```

### 6. Reiniciar o servidor backend
- Vá até o terminal onde está rodando `npm run dev` do backend
- Pressione `Ctrl+C` para parar o servidor
- Execute novamente: `npm run dev`

### 7. Limpar cache do navegador
- Abra o DevTools (F12)
- Clique com botão direito no ícone de refresh
- Selecione "Limpar cache e recarregar"

## Usando o Script Automatizado (Alternativa)

Se preferir usar o script automatizado:

```bash
cd f:\Documentos\Desenvolvimento\BelaFarma
./scripts/restore-production-db.sh
```

**Importante:** O script pedirá a senha interativamente. Certifique-se de que o terminal está visível para você digitar.

## Restaurar um Backup

Se precisar reverter para um backup anterior:

```bash
# Listar backups disponíveis
ls -lh backend/*.backup.*

# Restaurar backup específico
cp backend/belafarma.db.backup.YYYYMMDD_HHMMSS backend/belafarma.db
```

Ou usando o script:
```bash
./scripts/restore-production-db.sh --restore-backup backend/belafarma.db.backup.YYYYMMDD_HHMMSS
```

## Solução de Problemas

### Erro de conexão SSH
```bash
# Testar conexão
ssh ed@192.168.1.9
```

### Arquivo não encontrado no servidor
```bash
# Conectar via SSH e verificar
ssh ed@192.168.1.9
ls -la /home/ed/projetcs/BelaFarma/backend/
```

### Permissão negada no script
```bash
chmod +x scripts/restore-production-db.sh
```

## Notas de Segurança

⚠️ **NUNCA faça o caminho inverso** (desenvolvimento → produção) sem extremo cuidado
🔒 O banco de produção contém dados reais de clientes
💾 Sempre faça backup antes de qualquer alteração
