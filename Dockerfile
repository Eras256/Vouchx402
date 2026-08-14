# Vouch402 production image. node:sqlite needs Node 22.5+ (confirmed
# working unflagged on Node 24 locally, see DECISION_LOG.md) so this
# pins the same major version rather than a generic LTS tag.

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

EXPOSE 3402
CMD ["node", "dist/server/index.js"]
