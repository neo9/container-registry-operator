FROM alpine:3.13 as builder

RUN apk add --no-cache nodejs npm

WORKDIR /usr/src/app
COPY package.json ./
COPY tsconfig.json ./
RUN npm install
COPY ./src ./src
RUN npm run build

#------------------------------

FROM alpine:3.13 as runtime

RUN apk add --no-cache nodejs npm

WORKDIR /usr/src/app
COPY package.json ./
COPY ./templates/ ./templates
RUN npm install --only=production
COPY --from=builder /usr/src/app/dist ./dist
CMD ["node", "dist/index.js"]