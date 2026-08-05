FROM rust:1.85-slim AS build
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release --locked

FROM debian:bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --system --uid 10001 --create-home cesium
COPY --from=build /app/target/release/cesium-asset-service /usr/local/bin/cesium-asset-service
ENV PORT=7022
EXPOSE 7022
USER 10001:10001
ENTRYPOINT ["cesium-asset-service"]
