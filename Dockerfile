FROM node:22-slim

ENV TZ=Europe/Madrid

RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime \
  && echo $TZ > /etc/timezone

WORKDIR /usr/src/app

COPY package.json package-lock.json ./

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 build-essential \
  && npm ci --omit=dev \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

COPY . .

# Crear el archivo .env desde .env.template si no existe o está vacío.
RUN if [ ! -f .env ] || [ ! -s .env ]; then cp .env.template .env; fi

CMD ["npm", "start"]
