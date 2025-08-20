FROM node:20-bookworm-slim as deps
WORKDIR /app
COPY package.json package-lock.json* .npmrc* ./
# Use npm install to avoid lockfile mismatch during iterative dev
RUN npm install --include=dev

FROM node:20-bookworm-slim as runner
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
ENV NODE_ENV=production
CMD ["node", "dist/src/index.js"]
