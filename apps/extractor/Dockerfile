FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json* tsconfig.json ./
COPY apps/extractor ./apps/extractor
COPY packages/evidence ./packages/evidence
RUN npm install --ignore-scripts
RUN npm run build:extractor

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN useradd --system --uid 10001 extractor
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist/extractor ./dist/extractor
USER extractor
EXPOSE 8090
CMD ["node", "dist/extractor/apps/extractor/src/server.js"]
