FROM node:26-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json ./
COPY src ./src
COPY config ./config
COPY scripts ./scripts

RUN addgroup -S moxnox && adduser -S -G moxnox moxnox \
  && mkdir -p /app/data \
  && chown -R moxnox:moxnox /app

USER moxnox
EXPOSE 3333
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3333/healthz >/dev/null || exit 1

CMD ["node", "src/server.js"]
