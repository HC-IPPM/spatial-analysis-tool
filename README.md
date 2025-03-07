# Spatial Analysis Tool

Goal - deploy to Cloud Run (google cloud run functions (cloud functions gen 2) for the moment)


Flask App

Geospatial 


Cluster Analysis

## Run locally 

1. Activate virtual environemnt
```
python -m venv venv
source venv/bin/activate
```

2. Install dependendencies
```
pip install pdm
pdm install
```

3. Run 
```
export FLASK_APP=app.app
pdm run flask run
```