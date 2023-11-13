FROM node:21-alpine
MAINTAINER Candid Dauth <cdauth@cdauth.eu>

CMD yarn run server
EXPOSE 8080

RUN apk add --no-cache yarn

RUN adduser -D -h /opt/facilmap -s /bin/sh facilmap

WORKDIR /opt/facilmap/server

COPY ./ ../

RUN chown -R facilmap:facilmap /opt/facilmap

USER facilmap

RUN cd .. && yarn install

RUN cd .. && yarn run build

USER root
RUN chown -R root:root /opt/facilmap && mkdir -p /opt/facilmap/server/node_modules/.cache && chown -R facilmap:facilmap /opt/facilmap/server/node_modules/.cache

USER facilmap
