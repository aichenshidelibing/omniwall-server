#!/bin/sh
set -e

mkdir -p /app/data
chown -R node:node /app/data

exec gosu node "$@"
