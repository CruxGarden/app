# Static output is architecture-independent: build once on the native builder.
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder
WORKDIR /app
COPY package*.json .npmrc ./
COPY patches/ ./patches/
COPY electron/vendor/ ./electron/vendor/
# The public site needs JS tooling and patches, not desktop native install hooks.
RUN npm ci --ignore-scripts --no-audit --no-fund && npm run postinstall
COPY . .
ARG VITE_API_URL=http://localhost:3000
ARG VITE_PUBLISH_ORIGIN_TEMPLATE=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_PUBLISH_ORIGIN_TEMPLATE=$VITE_PUBLISH_ORIGIN_TEMPLATE
ENV VITE_PUBLIC_SITE=1
ENV CRUX_BUNDLE_TOOLS=none
ENV NODE_OPTIONS=--max-old-space-size=8192
RUN npm run build:public

# Stage 2: Serve
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
