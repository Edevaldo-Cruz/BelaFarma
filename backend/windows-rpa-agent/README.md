# 🤖 BelaFarma - Windows RPA Agent

Este é um agente de disparo de mensagens do WhatsApp super leve projetado especificamente para rodar no seu computador **Windows**, enquanto consome os dados e comandos da sua central de controle hospedada no servidor **Debian (Render / Cloud)**.

---

## 🎯 Por que esta arquitetura?

A automação direta do WhatsApp Web via Puppeteer em servidores Linux (Debian) em nuvem é altamente instável por causa de:
1. **Headless Mode**: O WhatsApp Web bloqueia facilmente navegadores invisíveis ou sem interface gráfica.
2. **Dependências**: Servidores Linux não possuem servidor de vídeo nativo (X11/GPU), o que causa quebras de layout e travamento no Chromium.
3. **Área de Transferência**: O envio estável de imagens com legenda exige a cópia física do arquivo para a área de transferência do sistema, o que o Windows faz com perfeição em um piscar de olhos.

**Solução Premium:**
Você agenda suas mensagens, escolhe imagens e define horários na interface linda da sua plataforma hospedada no Debian. O servidor guarda tudo. Este pequeno agente, rodando no seu computador Windows, faz consultas rápidas (polling), baixa as imagens e usa a estabilidade do Windows para enviar as mensagens de forma visível e humana, retornando o status de envio para o servidor imediatamente!

---

## ⚙️ Como Configurar

1. Abra a pasta `windows-rpa-agent` e edite o arquivo **`config.json`**:
   ```json
   {
     "serverUrl": "https://app.drogariabelafarma.com.br",
     "token": "BelafarmaSul2026",
     "pollingIntervalSeconds": 15,
     "chromeSessionDir": "./whatsapp-session-rpa"
   }
   ```
   * **`serverUrl`**: A URL da sua plataforma (coloque `https://app.drogariabelafarma.com.br` para produção ou `http://localhost:3001` para desenvolvimento local).
   * **`token`**: O token de acesso seguro (por padrão, usa o mesmo da Evolution API: `BelafarmaSul2026`).
   * **`pollingIntervalSeconds`**: A cada quantos segundos o agente consulta o servidor em busca de novos envios pendentes (padrão: `15`).
   * **`chromeSessionDir`**: A pasta onde ficará guardado o seu login do WhatsApp. Não apague esta pasta para não precisar escanear o QR Code novamente!

---

## 🚀 Como Executar

1. Certifique-se de ter o **Node.js** instalado no seu computador. (Se não tiver, baixe e instale a versão LTS recomendada em [nodejs.org](https://nodejs.org/)).
2. Dê um **duplo clique** no arquivo **`run-agent.bat`**.
3. Na primeira execução, o robô vai abrir o terminal do Windows, identificar que é a primeira vez e fazer o download automático do Puppeteer e do navegador Chromium (`npm install`).
4. Em seguida, uma janela dedicada do navegador vai se abrir carregando o **WhatsApp Web**:
   * Abra o WhatsApp no seu celular.
   * Vá em **Aparelhos Conectados > Conectar um Aparelho**.
   * Escaneie o **QR Code** exibido na tela do computador.
5. Pronto! Assim que carregar suas conversas, o terminal informará que o agente está **ONLINE**.
6. Deixe a janela do navegador aberta (você pode minimizá-la) e a janela preta do terminal ativa.

---

## 📝 Como funciona a sincronização?

* **Envio Imediato**: Na Central de Mensagens, ao clicar em **Disparar Agora 🚀**, a mensagem é enfileirada no banco de dados do servidor como `Pendente`. Em até 15 segundos (intervalo do loop), seu computador Windows puxa essa mensagem, abre o chat, copia e cola a imagem via PowerShell, digita a legenda e aperta enter.
* **Agendamentos**: Suas postagens programadas ficam na fila. Quando chegar o horário exato definido por você, a mensagem fica ativa e é imediatamente enviada pela sua máquina.
* **Atualização em Tempo Real**: Assim que o envio é feito, o agente reporta ao servidor o sucesso ou a mensagem de erro. A tela do seu calendário na plataforma se atualiza automaticamente na hora!
