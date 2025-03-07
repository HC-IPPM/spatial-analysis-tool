# Cloud Run Set up

# This outlines the set up required if to be deployed in a fresh GCP project.  
# Ideally this would be done in acm-core as IaC instead. (with non-default service accounts)

# Before you start: run 'gcloud auth login'

# ---- SET ENV VARIABLES - modify with your own in the README.md and run (or uncomment and change here)

PROJECT_ID=phx-01hwmw2c1r4
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
REPO_NAME=spatial-analysis-tool-repo
REGION=northamerica-northeast1

# ---- SET GCP PROJECT ---- (to the test project you are using))
gcloud config set project $PROJECT_ID

# ----- ENABLE SERVICES ---- 
#   artifact registry, scanning of registry, cloudbuild
gcloud services enable cloudresourcemanager.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    containeranalysis.googleapis.com \
    containerscanning.googleapis.com

# # To check which services have been enabled 
gcloud services list --enabled

# Create Artifact registry repo
gcloud artifacts repositories create $REPO_NAME \
 --location=northamerica-northeast1 \
 --repository-format=docker  \
 --project=$PROJECT_ID

