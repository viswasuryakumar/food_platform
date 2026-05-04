FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 5173
# --host 0.0.0.0 is required for Vite to be accessible from outside the container
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
