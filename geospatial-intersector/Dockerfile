FROM python:3.12-slim

# Set the working directory
WORKDIR /app

# Copy only the dependency files first
COPY pyproject.toml pdm.lock ./
RUN pip install --no-cache pdm

# Copy the rest of the application code
COPY . .
RUN pdm install 

# Host 0.0.0.0 for cloud run
ENV FLASK_APP=main
ENV FLASK_RUN_HOST=0.0.0.0
ENV FLASK_RUN_PORT=5000
ENV PYTHONUNBUFFERED=True


EXPOSE 5000

# Run the Flask app (changed to gunicorn for prod)
# CMD ["pdm", "run", "flask", "run", "--host=0.0.0.0", "--port=5000"]
CMD ["pdm", "run", "gunicorn", "--bind", "0.0.0.0:5000", "--log-level=debug", "main:app"]

