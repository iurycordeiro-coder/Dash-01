FROM node:20-bullseye-slim AS builder

WORKDIR /app

# Install dependencies and build application
COPY package.json pnpm-lock.yaml .
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:20-bullseye-slim AS runner
WORKDIR /app

COPY package.json pnpm-lock.yaml .
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate && pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dashboard-data.json ./dashboard-data.json

EXPOSE 3001
ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "dist/index.js"]
