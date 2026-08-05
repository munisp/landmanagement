FROM rust:1.85-bookworm AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock* ./
RUN mkdir src && printf 'fn main() {}\n' > src/main.rs && cargo build --release --locked || cargo build --release
RUN rm -rf src
COPY src ./src
RUN cargo build --release --locked

FROM alpine:3.20
RUN apk add --no-cache ca-certificates && addgroup -S context && adduser -S -G context -u 65532 context
COPY --from=build /src/target/release/context-tiles-service /context-tiles-service
EXPOSE 8092
USER context:context
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=5 CMD wget -q -O - http://127.0.0.1:8092/ready >/dev/null 2>&1 || exit 1
ENTRYPOINT ["/context-tiles-service"]
