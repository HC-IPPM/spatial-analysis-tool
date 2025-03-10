# Geospatial Intersector

## Run with Docker 

```
docker build -t geospatial-intersector .
docker run --rm -p 5000:5000 -e FLASK_DEBUG=1 -e FLASK_ENV=development geospatial-intersector
```
(or docker run --rm -p 5000:5000 geospatial-intersector for without logs)

## Run without Docker

1. Activate virtual environemnt
```
python3 -m venv venv
source venv/bin/activate
```

2. Install dependendencies
```
pip install pdm
pdm cache clear
pdm install -v
```

3. Run 
```
export FLASK_APP=main
pdm run flask run
```

## Deploy with Cloud Build


Authenticate:
```
gcloud auth login
```
Set GCP project to the one you'd like to deploy into (if set to a different project):
```
gcloud config set project <PROJECT_ID>
```
From this directory:
```
gcloud builds submit --config=cloudbuild.yaml
```