FROM node:22-alpine

ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --chown=node:node server.mjs ./server.mjs
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
