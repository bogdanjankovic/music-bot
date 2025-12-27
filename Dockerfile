FROM node:20-slim

# 1. Install System Dependencies
# yt-dlp-exec needs Python
# Discord Voice needs FFmpeg and Libsodium
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    libsodium-dev \
    git \
    && pip3 install yt-dlp --break-system-packages \
    && rm -rf /var/lib/apt/lists/*

# 2. Fix "python" command not found (symlink python3 -> python)
RUN ln -s /usr/bin/python3 /usr/bin/python

WORKDIR /app

# 3. Copy package files first (for caching)
COPY package*.json ./

# 4. Install Node dependencies
RUN npm ci

# 5. Copy the rest of the bot code
COPY . .

# 6. Start the bot
CMD ["npm", "start"]
