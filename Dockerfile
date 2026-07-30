FROM node:26-slim AS dependencies

WORKDIR /usr/src/app

COPY package.json package-lock.json ./

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 build-essential \
  && npm ci --omit=dev \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

FROM node:26-slim

ENV TZ=Europe/Madrid

RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime \
  && echo $TZ > /etc/timezone

WORKDIR /usr/src/app

COPY --from=dependencies --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --chown=node:node . .

# Valores por defecto para ejecuciones sin Compose. En producción, las variables
# inyectadas desde el .env del servidor tienen prioridad mediante env_file.
RUN if [ ! -f .env ] || [ ! -s .env ]; then cp .env.template .env; fi

USER node

CMD ["npm", "start"]
