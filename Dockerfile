FROM node:24-alpine AS frontend
WORKDIR /src/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM golang:1.25-alpine AS backend
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
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
