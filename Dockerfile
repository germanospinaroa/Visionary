FROM node:22-bookworm

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev

RUN npx playwright install --with-deps chromium

COPY . .

ENV NODE_ENV=production

EXPOSE 4001

HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD node -e "fetch(`http://127.0.0.1:${process.env.PORT || process.env.PILOT_WORKER_API_PORT || 4001}/health`).then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "run", "pilot:service"]
