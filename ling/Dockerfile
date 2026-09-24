# Linguistics sidecar. The JMdict dictionary is built in its own stage so the
# ~60 MB download is cached as a layer and the runtime image carries only the
# resulting SQLite file.
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

FROM base AS dictionary
COPY build_dict.py .
RUN python build_dict.py

FROM base
COPY app.py .
COPY --from=dictionary /app/data/jmdict-ja.sqlite data/jmdict-ja.sqlite
RUN useradd --system --uid 10001 ling
USER ling
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8090/health', timeout=4).status == 200 else 1)"
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8090"]
