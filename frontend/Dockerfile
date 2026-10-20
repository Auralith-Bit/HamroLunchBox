FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
RUN npm ci --workspace @hamro-lunch-box/frontend --include-workspace-root=false
COPY frontend ./frontend
RUN npm run build --workspace @hamro-lunch-box/frontend

FROM nginx:1.27-alpine
ENV BACKEND_HOST=backend
COPY frontend/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
