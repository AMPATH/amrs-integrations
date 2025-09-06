FROM node:16-alpine AS deps

WORKDIR /app
ENV NODE_ENV=development

COPY packages/hie-integration/package.json packages/hie-integration/yarn.lock ./

RUN yarn install --frozen-lockfile


FROM node:16-alpine AS builder

WORKDIR /app
ENV NODE_ENV=development

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/yarn.lock ./yarn.lock

COPY packages/hie-integration ./packages/hie-integration

WORKDIR /app/packages/hie-integration
RUN yarn build


# ---------- Runtime Stage ----------
FROM node:16-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

# Copy only production deps (optimized)
COPY packages/hie-integration/package.json packages/hie-integration/yarn.lock ./
RUN yarn install --frozen-lockfile --production

# Copy built artifacts
COPY --from=builder /app/packages/hie-integration/dist ./packages/hie-integration/dist
COPY --from=builder /app/packages/hie-integration/config ./packages/hie-integration/config

WORKDIR /app/packages/hie-integration

EXPOSE 9000
CMD ["node", "dist/index.js"]
