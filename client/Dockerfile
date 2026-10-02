FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY babel.config.js rollup.config.js ./
COPY src ./src
COPY template ./template
COPY public ./public
RUN npm run build

FROM nginx:1.30.5-alpine@sha256:0985e772fb9f729e6fa0980da05fca5d9c468e870eed43071545afa9d2e27d94
EXPOSE 80
COPY --chmod=755 docker/setup-env.sh /docker-entrypoint.d/05-setup-env.sh
COPY nginx/bitfeed.conf.template /etc/nginx/conf.d/default.conf.template
COPY --from=build /app/public/build /var/www/bitfeed
COPY LICENSE /usr/share/licenses/bitfeed/LICENSE
