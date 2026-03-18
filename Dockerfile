FROM mcr.microsoft.com/playwright:v1.40.0-jammy

WORKDIR /app

RUN apt-get update && apt-get install -y \
    xvfb \
    xauth \
    libgtk-3-0 \
    libgbm1 \
    libnss3 \
    libxss1 \
    libasound2 \
    fonts-liberation \
    libappindicator3-1 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .

ENV DISPLAY=:99
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["sh", "-c", "Xvfb :99 -screen 0 1920x1080x24 & node index.js"]
