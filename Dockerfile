FROM node:22-alpine

ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
WORKDIR /app

COPY --chown=node:node package.json ./package.json
COPY --chown=node:node server.mjs ./server.mjs
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public

USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server.mjs"]
