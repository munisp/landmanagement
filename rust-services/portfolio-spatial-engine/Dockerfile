FROM rust:1.85-bookworm AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock* ./
RUN mkdir src && printf 'fn main() {}\n' > src/main.rs && cargo build --release && rm -rf src
COPY src ./src
RUN cargo build --release

FROM alpine:3.20
RUN apk add --no-cache ca-certificates && addgroup -S portfolio && adduser -S -G portfolio -u 65532 portfolio
COPY --from=build /src/target/release/portfolio-spatial-engine /portfolio-spatial-engine
EXPOSE 8097
USER portfolio:portfolio
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=5 CMD wget -q -O - http://127.0.0.1:8097/ready >/dev/null 2>&1 || exit 1
ENTRYPOINT ["/portfolio-spatial-engine"]
