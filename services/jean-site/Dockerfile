# FILE / ROOT: services/jean-site/Dockerfile
# DESCRIPTION: Container image for jean-site on Cloud Run. node:22-slim, zero npm
#   dependencies (no install step), runs as the non-root "node" user, listens on $PORT.
#   site-index.json must exist in this directory at build time — deploy.sh copies it from
#   the repo's assets/jean/site-index.json first; the build fails loudly if it is missing.

FROM node:22-slim

ENV NODE_ENV=production \
    PORT=8080 \
    JEAN_INDEX_FILE=/app/site-index.json

WORKDIR /app

COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node site-index.json ./site-index.json

USER node

EXPOSE 8080

CMD ["node", "src/server.js"]
