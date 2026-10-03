FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_SHOW_DEMO_PASSWORD=true
ENV VITE_SHOW_DEMO_PASSWORD=$VITE_SHOW_DEMO_PASSWORD
RUN npm run build
FROM nginx:1.28-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
