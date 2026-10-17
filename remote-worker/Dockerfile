FROM node:22-alpine

RUN apk add --no-cache docker-cli
WORKDIR /app
COPY --chown=node:node remote-worker/server.mjs ./remote-worker/server.mjs

ENV NODE_ENV=production
USER node
EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:8788/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "remote-worker/server.mjs"]
