#!/bin/sh

# Exit immediately if a command exits with a non-zero status
set -e

echo "Applying pending Prisma database migrations..."
npx prisma migrate deploy

echo "Starting the application..."
exec "$@"
