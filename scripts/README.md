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

- Acesso SSH ao servidor de produção (192.168.1.70)
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
- Verifique se você consegue conectar manualmente: `ssh ed@192.168.1.70`
- Confirme que a senha está correta (2494)

**Arquivo não encontrado no servidor:**
- Verifique se o caminho está correto: `/home/ed/projetcs/BelaFarma/backend/belafarma.db`
- Conecte via SSH e confirme: `ls -la /home/ed/projetcs/BelaFarma/backend/`


### `reboot-vps.sh`

Script para realizar uma **iniciação limpa** (reboot) do servidor VPS de produção.

#### Uso:

```bash
./scripts/reboot-vps.sh
```

#### O que o script faz:
1. Conecta via SSH ao servidor `192.168.1.70`
2. Solicita confirmação do usuário
3. Executa `sudo reboot` para reiniciar o sistema operacional e todos os serviços
4. Limpa memória e processos travados


### `setup-auto-backup.sh`

Configura backups automáticos no servidor de produção (VPS).

#### Uso:

```bash
./scripts/setup-auto-backup.sh
```

#### O que o script faz:
1. Envia o script de backup (`server-backup-template.sh`) para o servidor
2. Configura o **Cron** (agendador de tarefas) no servidor
3. Define a execução **duas vezes ao dia**: 12:00 e 23:00
4. Os backups são salvos no servidor em `/home/ed/backups/belafarma`
5. Mantém histórico dos últimos **30 dias**


### `manage-remote-backups.sh`

Gerenciador interativo de backups históricos. Permite visualizar os backups salvar pelo agendamento automático e restaurá-los.

#### Uso:

```bash
./scripts/manage-remote-backups.sh
```

#### Funcionalidades:
1. **Listagem Visual**: Mostra todos os backups disponíveis no VPS com data e hora
2. **Download para Local**: Permite baixar um backup antigo para testar ou analisar dados passados no seu ambiente de desenvolvimento
3. **Rollback de Produção**: Permite restaurar um backup antigo diretamente no servidor de produção (com backup de segurança automático antes da operação)


### `create-remote-backup.sh`

Força a criação imediata de um novo backup no servidor VPS, fora do horário agendado.

#### Uso:

```bash
./scripts/create-remote-backup.sh
```

#### O que o script faz:
1. Conecta ao servidor e executa o script de backup
2. Confirma a criação e mostra o nome/tamanho do novo arquivo gerado
3. Útil para fazer um ponto de salvamento manual antes de grandes alterações ou deploy


### `check-backup-status.sh`

Diagnóstico rápido para verificar se o agendamento está ativo e correto.

#### Uso:

```bash
./scripts/check-backup-status.sh
```

#### O que o script verifica:
1. **Hora do Servidor:** Importante para saber se 12:00 lá é o mesmo que 12:00 aqui.
2. **Serviço Cron:** Se o motor de agendamento do Linux está rodando.
3. **Lista de Tarefas:** Se o backup está realmente na lista de tarefas agendadas.

## 🔧 Manutenção

Para adicionar novos scripts a este diretório:

1. Crie o arquivo `.sh` com permissões de execução
2. Adicione documentação neste README
3. Siga o padrão de nomenclatura: `nome-descritivo.sh`
4. Inclua comentários explicativos no código
5. Use cores e formatação para melhor UX no terminal
