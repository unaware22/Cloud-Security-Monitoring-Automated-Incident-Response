FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
WORKDIR /app
ARG NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION=false
ARG NEXT_PUBLIC_MIDTRANS_CLIENT_KEY
ENV NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION=$NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION
ENV NEXT_PUBLIC_MIDTRANS_CLIENT_KEY=$NEXT_PUBLIC_MIDTRANS_CLIENT_KEY
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
ENV NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION=$NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION
ENV NEXT_PUBLIC_MIDTRANS_CLIENT_KEY=$NEXT_PUBLIC_MIDTRANS_CLIENT_KEY

RUN mkdir -p /app/logs && chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && ./node_modules/.bin/next start -p 3000"]
