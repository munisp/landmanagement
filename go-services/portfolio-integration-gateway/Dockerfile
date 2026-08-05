FROM golang:1.22-bookworm AS build
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags='-s -w' -o /out/portfolio-integration-gateway .

FROM alpine:3.20
RUN apk add --no-cache ca-certificates && addgroup -S portfolio && adduser -S -G portfolio -u 65532 portfolio
COPY --from=build /out/portfolio-integration-gateway /portfolio-integration-gateway
EXPOSE 8096
USER portfolio:portfolio
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=5 CMD wget -q -O - http://127.0.0.1:8096/ready >/dev/null 2>&1 || exit 1
ENTRYPOINT ["/portfolio-integration-gateway"]
