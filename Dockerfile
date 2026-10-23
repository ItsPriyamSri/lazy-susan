# The app reads a folder of documents, fills a form, and can open a browser on
# a page to type the result. The browser is the only system dependency: it is
# here so the fill works on a deployment with no key at all. Headless, because
# a container has no screen.

FROM node:22-slim

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Chromium and a font it can draw text with. Without these the portal route has
# nothing to launch on a host that is not a laptop.
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

ENV CHROME_PATH=/usr/bin/chromium \
    PORTAL_HEADLESS=1

WORKDIR /app

# One copy, then install: the workspace is a set of linked packages, and
# copying them one package.json at a time breaks that link on the first
# package anyone forgets to add here.
COPY . .

RUN pnpm install --frozen-lockfile --prod=false \
 && pnpm build \
 && pnpm store prune

ENV PORT=4757
EXPOSE 4757

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4757)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/brain/dist/index.js"]
