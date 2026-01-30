# Scripts de Manutenção - BelaFarma

Este diretório contém scripts utilitários para facilitar tarefas de manutenção e desenvolvimento do projeto BelaFarma.

## 📜 Scripts Disponíveis

### `restore-production-db.sh`

Script para restaurar o banco de dados de produção no ambiente de desenvolvimento local.

#### Uso Básico

```bash
# Restaurar banco de produção (cria backup automático)
./scripts/restore-production-db.sh
```

#### Opções Avançadas

```bash
# Listar todos os backups disponíveis
./scripts/restore-production-db.sh --list-backups

# Restaurar um backup específico
./scripts/restore-production-db.sh --restore-backup backend/belafarma.db.backup.2026-01-30_12-20-35
```

#### O que o script faz:

1. ✅ Cria backup automático do banco local com timestamp
2. ✅ Baixa o banco de dados do servidor de produção via SCP
3. ✅ Verifica a integridade do arquivo baixado
4. ✅ Substitui o banco local pelo de produção
5. ✅ Limpa arquivos temporários
6. ✅ Exibe instruções para reiniciar o servidor

#### Requisitos:

- Acesso SSH ao servidor de produção (192.168.1.9)
- Senha do usuário `ed`
- Git Bash ou terminal compatível com bash no Windows

#### Após executar o script:

1. **Reinicie o servidor backend:**
   ```bash
   cd backend
   # Pressione Ctrl+C no terminal do backend
   npm run dev
   ```

2. **Limpe o cache do navegador:**
   - Pressione F12 para abrir DevTools
   - Clique com botão direito no ícone de refresh
   - Selecione "Limpar cache e recarregar"

#### Segurança:

- ⚠️ **Nunca execute o caminho inverso** (desenvolvimento → produção) sem extrema cautela
- 🔒 O banco de produção contém dados reais de clientes
- 💾 Backups são criados automaticamente antes de qualquer alteração
- 🔄 Você pode restaurar qualquer backup usando a opção `--restore-backup`

#### Solução de Problemas:

**Erro de permissão:**
```bash
chmod +x scripts/restore-production-db.sh
```

**Erro de conexão SSH:**
- Verifique se você consegue conectar manualmente: `ssh ed@192.168.1.9`
- Confirme que a senha está correta (2494)

**Arquivo não encontrado no servidor:**
- Verifique se o caminho está correto: `/home/ed/projetcs/BelaFarma/backend/belafarma.db`
- Conecte via SSH e confirme: `ls -la /home/ed/projetcs/BelaFarma/backend/`

## 🔧 Manutenção

Para adicionar novos scripts a este diretório:

1. Crie o arquivo `.sh` com permissões de execução
2. Adicione documentação neste README
3. Siga o padrão de nomenclatura: `nome-descritivo.sh`
4. Inclua comentários explicativos no código
5. Use cores e formatação para melhor UX no terminal
