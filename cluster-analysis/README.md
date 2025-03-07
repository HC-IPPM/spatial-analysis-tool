# Cluster Analysis

## Run with Docker 

```
docker build -t cluster-analysis .
docker run -rm -p 5000:5000 cluster-analysis
```

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
export FLASK_APP=app.app
pdm run flask run
```