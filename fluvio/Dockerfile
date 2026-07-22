FROM ubuntu:24.04

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsS https://hub.infinyon.cloud/install/install.sh?ctx=dc | bash

ENV PATH="/root/.fluvio/bin:/root/.fvm/bin:${PATH}"
