FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    libreoffice-impress \
    poppler-utils \
    ffmpeg \
    fonts-noto-cjk \
    ca-certificates \
    python3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build \
  && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=3780
ENV SUBTITLE_FONT=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc

EXPOSE 3780

VOLUME ["/app/data"]

CMD ["node", "dist/index.js"]
