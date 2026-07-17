FROM python:3.11-slim

WORKDIR /app

COPY lakehouse/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY lakehouse /app

ENV PYTHONUNBUFFERED=1
ENV LAKEHOUSE_API_HOST=0.0.0.0
ENV LAKEHOUSE_API_PORT=8000

CMD ["python", "api/main.py"]
