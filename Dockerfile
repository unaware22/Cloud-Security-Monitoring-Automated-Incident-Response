FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
WORKDIR /app
ARG NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION=false
ARG NEXT_PUBLIC_MIDTRANS_CLIENT_KEY
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION=$NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION
ENV NEXT_PUBLIC_MIDTRANS_CLIENT_KEY=$NEXT_PUBLIC_MIDTRANS_CLIENT_KEY
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
# Prisma detects the available OpenSSL ABI while generating its query engine.
# Alpine must therefore have OpenSSL installed in the build stage as well as
# in the final image; otherwise Prisma generates an OpenSSL 1.1 engine that
# cannot load on the OpenSSL 3 runtime.
RUN apk add --no-cache openssl
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ARG NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION=false
ARG NEXT_PUBLIC_MIDTRANS_CLIENT_KEY
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NODE_ENV=production

RUN apk add --no-cache openssl libc6-compat && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=dependencies /app/node_modules ./node_modules
# `prisma generate` writes the generated client to node_modules/.prisma in the
# build stage. The runtime image needs that generated client for every API
# route that imports @prisma/client.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
ENV NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION=$NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION
ENV NEXT_PUBLIC_MIDTRANS_CLIENT_KEY=$NEXT_PUBLIC_MIDTRANS_CLIENT_KEY
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY

# Generate the Prisma Client again in the final Alpine runtime image.  The
# client generated in a different stage can be missing the runtime-specific
# query engine, which makes the app report the database as unavailable even
# when PostgreSQL itself is healthy.
RUN npx prisma generate && \
    mkdir -p /app/logs && \
    chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node prisma/optimize-product-images.mjs && exec ./node_modules/.bin/next start -H 0.0.0.0 -p 3000"]
