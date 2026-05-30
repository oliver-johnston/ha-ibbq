ARG BUILD_FROM
FROM ${BUILD_FROM:-python:3.12-alpine}

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ src/
COPY run.sh .
RUN chmod +x run.sh

CMD ["/app/run.sh"]
