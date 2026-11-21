FROM node:24-alpine AS frontend
WORKDIR /src/web
COPY web/package*.json ./
RUN --mount=type=secret,id=build-ca \
    if [ -r /run/secrets/build-ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build-ca; fi; \
    npm ci
COPY web/ ./
RUN npm run build

FROM golang:1.25-alpine AS backend
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=secret,id=build-ca \
    if [ -r /run/secrets/build-ca ]; then export SSL_CERT_FILE=/run/secrets/build-ca; fi; \
    go mod download
COPY main.go ./
COPY db/ ./db/
RUN CGO_ENABLED=0 go build -trimpath -o /market .

FROM alpine:3.23
RUN adduser -D market
COPY --from=backend /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
WORKDIR /app
COPY --from=backend /market /app/market
COPY --from=frontend /src/web/dist /app/web/dist
USER market
ENV PORT=8080 STATIC_DIR=/app/web/dist
EXPOSE 8080
ENTRYPOINT ["/app/market"]
