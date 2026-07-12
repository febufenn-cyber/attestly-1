FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install --ignore-scripts
COPY tsconfig.json ./
COPY packages/questionnaire ./packages/questionnaire
COPY apps/questionnaire-processor ./apps/questionnaire-processor
RUN npm run build:questionnaire-processor

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist/questionnaire-processor ./dist/questionnaire-processor
USER node
EXPOSE 8090
CMD ["node", "dist/questionnaire-processor/apps/questionnaire-processor/src/server.js"]
