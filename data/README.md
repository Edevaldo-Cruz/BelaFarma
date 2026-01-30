# Diretório de Dados do Banco SQLite

Este diretório contém o banco de dados SQLite da aplicação.

## Arquivos

- `belafarma.db` - Banco de dados principal
- `belafarma.db-wal` - Write-Ahead Log (criado automaticamente pelo SQLite)
- `belafarma.db-shm` - Shared Memory (criado automaticamente pelo SQLite)

## Importante

⚠️ **NÃO DELETE ESTES ARQUIVOS EM PRODUÇÃO!**

Todos os dados da aplicação estão armazenados aqui.

## Backup

Para fazer backup:
```bash
# Copiar o arquivo .db
cp belafarma.db belafarma-backup-$(date +%Y%m%d).db
```

## Permissões

O diretório precisa ter permissões de leitura e escrita para o usuário que roda o Docker:
```bash
chmod 777 data  # Para desenvolvimento/teste
# ou
chown 1000:1000 data  # Para produção (ajustar UID conforme necessário)
```
