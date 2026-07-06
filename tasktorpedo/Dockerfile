ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.19
FROM $BUILD_FROM

RUN apk add --no-cache python3

COPY app/ /app/
WORKDIR /app

EXPOSE 8099

HEALTHCHECK --interval=60s --timeout=5s \
  CMD wget -qO- http://127.0.0.1:8099/api/health || exit 1

CMD ["python3", "-u", "server.py"]
