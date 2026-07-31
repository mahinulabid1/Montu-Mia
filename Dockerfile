# Base stage with pnpm setup
FROM node:23.11.1-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app
# Force pnpm to use standard flat node_modules layout (no symlinks) to prevent Docker stage copying issues
RUN echo "node-linker=hoisted" > .npmrc

# Production dependencies stage
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
# Install only production dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile --ignore-scripts

# Build stage - install all dependencies and build
FROM base AS build
COPY package.json pnpm-lock.yaml ./
# Install all dependencies (including dev dependencies)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts

# Copy Prisma schema and generate client
COPY prisma ./prisma/
RUN pnpm prisma generate

# Copy application source and compile
COPY . .
RUN pnpm run build

# Final stage - combine production dependencies and build output
FROM node:23.11.1-slim AS runner
WORKDIR /app

# Copy production node_modules (which now contains real directories, not symlinks)
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules

# Copy generated Prisma Client and engine binaries
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma

# Copy built application
COPY --from=build --chown=node:node /app/dist ./dist

# Copy static Web UI files (required for express.static and sendFile in production)
COPY --from=build --chown=node:node /app/src/admin-app/view ./src/admin-app/view

# Copy Prisma schema for runtime reference/metadata
COPY --from=build --chown=node:node /app/prisma ./prisma

# Use the node user from the image
USER node

# Expose port 8080
EXPOSE 8080

# Start the server
CMD ["node", "dist/index.js"]
