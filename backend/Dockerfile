# Use uma imagem base do Node.js (v20+ necessário para better-sqlite3)
FROM node:22-alpine

# Crie e defina o diretório de trabalho dentro do contêiner
WORKDIR /usr/src/app

# Instale dependências para o Puppeteer e o Chromium
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont \
      font-noto-emoji \
      powershell-jumbo || true

# Configurações para Puppeteer encontrar o Chromium no Alpine
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY package*.json ./
RUN npm install

# Copie o restante do código-fonte do backend
COPY . .

# Exponha a porta em que o aplicativo será executado
EXPOSE 3001

# Comando para iniciar o servidor
CMD [ "npm", "start" ]
