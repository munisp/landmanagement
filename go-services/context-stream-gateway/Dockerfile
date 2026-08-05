FROM golang:1.22-bookworm AS build
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags='-s -w' -o /out/context-stream-gateway .

FROM alpine:3.20
RUN apk add --no-cache ca-certificates && addgroup -S context && adduser -S -G context -u 65532 context
COPY --from=build /out/context-stream-gateway /context-stream-gateway
EXPOSE 8091
USER context:context
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=5 CMD wget -q -O - http://127.0.0.1:8091/ready >/dev/null 2>&1 || exit 1
ENTRYPOINT ["/context-stream-gateway"]
