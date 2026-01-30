# Instruções de Deploy na VPS

## Pré-requisitos

- Docker e Docker Compose instalados na VPS
- Acesso SSH à VPS
- Repositório Git configurado (opcional)

## Passo a Passo

### 1. Preparar o Ambiente na VPS

```bash
# Conectar à VPS via SSH
ssh usuario@seu-servidor.com

# Navegar para o diretório do projeto
cd /caminho/para/BelaFarma

# Criar diretório de dados
mkdir -p data
chmod 777 data  # Permissões para desenvolvimento/teste
```

### 2. Atualizar o Código

```bash
# Se usando Git
git pull origin main

# Ou fazer upload manual via SCP/SFTP
```

### 3. Build e Deploy

```bash
# Parar containers existentes
docker-compose down

# Rebuild das imagens
docker-compose build

# Iniciar em modo detached
docker-compose up -d

# Verificar logs
docker-compose logs -f
```

### 4. Verificar Persistência

```bash
# 1. Acessar a aplicação no navegador
# 2. Criar um usuário ou pedido de teste
# 3. Verificar se o arquivo do banco foi criado
ls -la data/

# Deve mostrar:
# belafarma.db
# belafarma.db-wal
# belafarma.db-shm

# 4. Reiniciar o backend
docker-compose restart backend

# 5. Verificar se os dados persistiram
# Acessar novamente e verificar se o dado ainda está lá
```

### 5. Inicializar Banco (Primeira Vez)

Se for a primeira vez rodando na VPS, você precisa criar um usuário admin:

```bash
# Opção 1: Usar a chave mestra
# Login com: belafarma2024

# Opção 2: Executar script de inicialização
# (Copiar o arquivo belafarma.db do desenvolvimento para ./data/)
```

## Troubleshooting

### Dados não persistem após reiniciar

```bash
# Verificar se o volume está montado
docker inspect <container_id> | grep Mounts -A 10

# Verificar permissões
ls -la data/

# Verificar logs
docker-compose logs backend | grep -i error
```

### Erro de permissão

```bash
# Ajustar permissões do diretório
chmod 777 data/

# Ou ajustar ownership
sudo chown -R 1000:1000 data/
```

### Container não inicia

```bash
# Ver logs detalhados
docker-compose logs backend

# Verificar se a porta 3001 está livre
netstat -tulpn | grep 3001

# Rebuild forçado
docker-compose build --no-cache
docker-compose up -d
```

## Backup

### Backup Manual

```bash
# Criar backup do banco
cp data/belafarma.db backups/belafarma-$(date +%Y%m%d-%H%M%S).db
```

### Backup Automático (Cron)

```bash
# Editar crontab
crontab -e

# Adicionar linha para backup diário às 2h da manhã
0 2 * * * cp /caminho/para/BelaFarma/data/belafarma.db /caminho/para/backups/belafarma-$(date +\%Y\%m\%d).db
```

## Atualização

```bash
# 1. Fazer backup
cp data/belafarma.db backups/belafarma-backup.db

# 2. Atualizar código
git pull

# 3. Rebuild
docker-compose down
docker-compose build
docker-compose up -d

# 4. Verificar logs
docker-compose logs -f
```

## Monitoramento

```bash
# Ver status dos containers
docker-compose ps

# Ver logs em tempo real
docker-compose logs -f

# Ver uso de recursos
docker stats

# Verificar tamanho do banco
ls -lh data/belafarma.db
```

## Segurança

> [!IMPORTANT]
> - Altere a chave mestra `belafarma2024` em produção
> - Configure firewall para bloquear porta 3001 (apenas Nginx deve acessar)
> - Use HTTPS (configure certificado SSL no Nginx)
> - Faça backups regulares do banco de dados
> - Mantenha o Docker e dependências atualizados
