# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY packages/server/package.json packages/server/
RUN npm ci
COPY packages/server packages/server
RUN npm run build --workspace=packages/server

# Production stage
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY packages/server/package.json packages/server/
RUN npm ci --omit=dev
COPY --from=builder /app/packages/server/dist ./packages/server/dist
EXPOSE 3000
CMD ["node", "packages/server/dist/index.js"]
