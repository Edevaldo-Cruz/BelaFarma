# Use uma imagem base do Node.js
FROM node:18-alpine

# Crie e defina o diretório de trabalho dentro do contêiner
WORKDIR /usr/src/app

# Copie os arquivos de manifesto do pacote e instale as dependências
# Usar 'COPY' separado para package*.json aproveita o cache do Docker
COPY package*.json ./
RUN npm install

# Copie o restante do código-fonte do backend
COPY . .

# Exponha a porta em que o aplicativo será executado
EXPOSE 3001

# Comando para iniciar o servidor
CMD [ "npm", "start" ]
