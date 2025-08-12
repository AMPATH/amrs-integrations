# Stage 1: Build the application
FROM node:18-alpine AS builder
WORKDIR /app

# Copy package.json and lock files first for caching
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production

# Copy source code
COPY . ./

# Build TypeScript project
RUN yarn build

# Stage 2: Create production image
FROM node:18-alpine
WORKDIR /app

# Install production dependencies only
COPY --from=builder /app/package.json /app/yarn.lock ./
RUN yarn install --frozen-lockfile --production

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/.env.prod ./.env

# Copy other required files
COPY --from=builder /app/tsconfig.json ./

# Expose port and set environment
EXPOSE 9000
ENV NODE_ENV=production

# Start command
CMD ["node", "dist/index.js"]