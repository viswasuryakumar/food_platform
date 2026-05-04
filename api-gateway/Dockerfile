FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Gateway usually runs on 3000
EXPOSE 3000

CMD ["node", "index.js"]
