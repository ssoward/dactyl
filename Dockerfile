# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json tsconfig.scripts.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

# Stage 2: Production
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY src/db/migrations ./src/db/migrations
COPY src/db/seeds ./src/db/seeds
COPY scripts ./scripts
COPY dashboard ./dashboard
COPY docs ./docs
EXPOSE 3000
CMD ["node", "dist/index.js"]
