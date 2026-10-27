FROM node:22-alpine AS web
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM node:22-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
COPY server/package.json server/package-lock.json ./server/
RUN npm ci --omit=dev --prefix server && npm cache clean --force
COPY --chown=node:node server/src ./server/src
COPY --chown=node:node server/scripts ./server/scripts
COPY --from=web --chown=node:node /build/dist ./dist
USER node
EXPOSE 4000
CMD ["node", "server/src/index.js"]
