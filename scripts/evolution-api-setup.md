# 📱 Configuração da Evolution API (WhatsApp)

Para que o sistema BelaFarma consiga enviar mensagens via WhatsApp, vamos usar a **Evolution API**, que é gratuita e rodará na sua própria VPS.

Siga os passos abaixo, seja copiando os arquivos para a VPS ou configurando via terminal.

---

## 🚀 Passo 1: Atualizar o servidor
As alterações no código (`docker-compose.yml`, `.env`, e os arquivos `.js`) já foram feitas. Você só precisa copiá-las para sua VPS.

Execute o comando de deploy/update que você normalmente usa:
```bash
# Se você usa o git na VPS:
git pull origin main

# E depois reinicie o Docker:
docker-compose down
docker-compose up -d --build
```

---

## 📱 Passo 2: Conectar o WhatsApp

Após o comando `docker-compose up -d --build` rodar, a Evolution API estará rodando na porta **8080** da sua VPS.

### Acessar a interface de gerência (Manager)
1. Abra o navegador e digite o IP da sua VPS na porta 8080, seguido de `/manager`
   - Exemplo: `http://192.168.1.100:8080/manager` ou `http://IP_DA_VPS:8080/manager`
2. Escolha **Português**.
3. Em "Autenticação", escolha **Global API Key**.
4. Coloque a senha que configuramos: `BelafarmaSul2026`
5. Clique em **Conectar**.

### Criar uma Instância (Sua sessão de WhatsApp)
1. Na tela inicial do Manager, clique em **Nova Instância**.
2. **Nome da Instância:** `belafarma` (tem que ser exatamente em minúsculo, igual configuramos no sistema).
3. Leia o resto das configurações (por padrão todas servem) e clique em **Salvar e Continuar**.

### Escanear o QR Code
1. A instância aparecerá na lista.
2. Clique no ícone de QR Code 📲
3. Abra o **WhatsApp do seu celular** e escaneie o código (igual você faz para entrar no WhatsApp Web).
4. Espere ele conectar e ficar com status **Open** (Aberto).

---

## 🧪 Passo 3: Testar o Envio

Volte no sistema **BelaFarma**:
1. Faça login como **Administrador**.
2. Vá em **Mensagens WA** no menu lateral.
3. Na aba **Enviar**, preencha um número de WhatsApp (com DDD, ex: 32988634755).
4. Escreva uma mensagem.
5. Clique em **Enviar Mensagem** ou use o botão **Enviar Teste para Admin**.

Se as mensagens chegarem, está tudo funcionando perfeitamente! 🚀

---

## 🛠️ Possíveis Problemas

- **Não abre a página na porta 8080:** Verifique se o firewall/iptables da sua VPS Pi está liberando a porta `8080`. Se preferir, pode rodar `sudo ufw allow 8080`.
- **QR Code não carrega:** Tente criar a aba "Instances" novamente, certifique-se que o nome é `belafarma`.
- **Erro de CORS/IP:** A Evolution API e o Backend devem conseguir conversar entre si pelo nome `http://evolution-api:8080`, que é a rede interna do docker-compose que já configuramos.
