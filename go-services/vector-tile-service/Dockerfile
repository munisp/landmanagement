FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags='-s -w' -o /out/vector-tile-service .

FROM alpine:3.20
RUN apk add --no-cache ca-certificates wget \
  && addgroup -S geospatial \
  && adduser -S -G geospatial -u 10001 geospatial
COPY --from=build /out/vector-tile-service /usr/local/bin/vector-tile-service
ENV PORT=7021
EXPOSE 7021
USER 10001:10001
ENTRYPOINT ["/usr/local/bin/vector-tile-service"]
