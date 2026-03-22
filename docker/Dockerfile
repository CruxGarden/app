# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
ARG VITE_API_URL=http://localhost:3000
ARG VITE_PUBLISH_ORIGIN_TEMPLATE=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_PUBLISH_ORIGIN_TEMPLATE=$VITE_PUBLISH_ORIGIN_TEMPLATE
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
