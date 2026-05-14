# Use Debian Bullseye (mais estável para Puppeteer)
FROM node:22-bullseye-slim

# Crie e defina o diretório de trabalho dentro do contêiner
WORKDIR /usr/src/app

# Instale dependências para o Puppeteer e o Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Configurações para Puppeteer encontrar o Chromium no Debian
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Copie os arquivos de manifesto do pacote e instale as dependências
COPY package*.json ./
RUN npm install

# Copie o restante do código-fonte do backend
COPY . .

# Exponha a porta em que o aplicativo será executado
EXPOSE 3001

# Comando para iniciar o servidor
CMD [ "npm", "start" ]
