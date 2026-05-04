# Use Python 3.12 as the base
FROM python:3.12-slim

# Install Node.js - Required because our AI Agent spawns a Node.js process for the MongoDB MCP server
RUN apt-get update && apt-get install -y \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy and install Node.js dependencies (for the MCP server)
COPY package*.json ./
RUN npm install

# Copy and install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the service code
COPY . .

# AI Agent runs on port 8000
EXPOSE 8000

# Start the agent
CMD ["python", "-u", "agent.py"]
