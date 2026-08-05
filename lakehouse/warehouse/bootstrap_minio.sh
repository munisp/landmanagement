#!/bin/sh
set -eu

: "${S3_ENDPOINT:?S3_ENDPOINT must be configured}"
: "${S3_ACCESS_KEY:?S3_ACCESS_KEY must be configured}"
: "${S3_SECRET_KEY:?S3_SECRET_KEY must be configured}"
: "${S3_BUCKET:?S3_BUCKET must be configured}"

mc alias set idlr-lakehouse "${S3_ENDPOINT}" "${S3_ACCESS_KEY}" "${S3_SECRET_KEY}" >/dev/null
mc mb --ignore-existing "idlr-lakehouse/${S3_BUCKET}" >/dev/null
mc anonymous set none "idlr-lakehouse/${S3_BUCKET}" >/dev/null
printf '%s\n' "Lakehouse warehouse bucket is private and ready."
