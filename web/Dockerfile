FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_AUTH_URL=http://127.0.0.1:8003
ARG VITE_PROFILES_URL=http://127.0.0.1:8001
ARG VITE_MATCH_URL=http://127.0.0.1:8000
ARG VITE_EVENTS_URL=http://127.0.0.1:8002
ARG VITE_CHATS_URL=http://127.0.0.1:8004
ENV VITE_AUTH_URL=$VITE_AUTH_URL
ENV VITE_PROFILES_URL=$VITE_PROFILES_URL
ENV VITE_MATCH_URL=$VITE_MATCH_URL
ENV VITE_EVENTS_URL=$VITE_EVENTS_URL
ENV VITE_CHATS_URL=$VITE_CHATS_URL

RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
