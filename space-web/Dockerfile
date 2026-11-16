ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json server.mjs ./
COPY src/ ./src/
COPY public/ ./public/
COPY fixtures/ ./fixtures/
COPY sites/ ./sites/
COPY agent-skills/ ./agent-skills/
COPY scripts/owner-token.mjs scripts/container-health.mjs ./scripts/
RUN mkdir -p /app/.local && chown node:node /app/.local && chmod 700 /app/.local
USER node
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "scripts/container-health.mjs"]
CMD ["node", "server.mjs"]
