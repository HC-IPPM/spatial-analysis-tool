"""Generate ISO 19115:2014 compliant metadata for spatial analysis results."""
import json
from datetime import datetime
import uuid


def generate_kmeans_metadata(parameters, input_data_info, output_data_info):
    """
    Generate ISO 19115:2014 compliant metadata for K-means clustering analysis.
    
    Args:
        parameters (dict): K-means parameters used in the analysis
        input_data_info (dict): Information about input dataset
        output_data_info (dict): Information about output results
    
    Returns:
        dict: ISO 19115:2014 compliant metadata
    """
    metadata = {
        "MD_Metadata": {
            "fileIdentifier": str(uuid.uuid4()),
            "language": "eng",
            "characterSet": "utf8",
            "hierarchyLevel": "dataset",
            "contact": {
                "CI_ResponsibleParty": {
                    "organisationName": "Government of Canada",
                    "role": "pointOfContact"
                }
            },
            "dateStamp": datetime.utcnow().isoformat() + "Z",
            "metadataStandardName": "ISO 19115:2014",
            "metadataStandardVersion": "2014",
            "identificationInfo": {
                "MD_DataIdentification": {
                    "citation": {
                        "CI_Citation": {
                            "title": "K-means Clustering Analysis Results",
                            "date": {
                                "CI_Date": {
                                    "date": datetime.utcnow().isoformat() + "Z",
                                    "dateType": "creation"
                                }
                            }
                        }
                    },
                    "abstract": "Results of K-means clustering analysis on spatial data",
                    "purpose": "Spatial point pattern analysis using K-means clustering",
                    "status": "completed",
                    "spatialRepresentationType": "vector",
                    "language": "eng",
                    "characterSet": "utf8",
                    "topicCategory": "geoscientificInformation"
                }
            },
            "distributionInfo": {
                "MD_Distribution": {
                    "distributionFormat": {
                        "MD_Format": {
                            "name": "GeoJSON",
                            "version": "2008"
                        }
                    }
                }
            },
            "dataQualityInfo": {
                "DQ_DataQuality": {
                    "scope": {
                        "DQ_Scope": {
                            "level": "dataset"
                        }
                    },
                    "lineage": {
                        "LI_Lineage": {
                            "statement": "K-means clustering analysis performed on spatial points data",
                            "processStep": {
                                "LI_ProcessStep": {
                                    "description": "K-means clustering analysis",
                                    "processor": {
                                        "CI_ResponsibleParty": {
                                            "organisationName": "Government of Canada",
                                            "role": "processor"
                                        }
                                    },
                                    "source": input_data_info,
                                    "processingInformation": {
                                        "algorithm": {
                                            "name": "K-means clustering",
                                            "parameters": parameters
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    return metadata


def save_metadata(metadata, output_path):
    """Save metadata to a JSON file."""
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)


def generate_kmeans_analysis_metadata(
    k,
    max_iterations,
    init_method,
    distance_metric,
    convergence_tolerance,
    random_seed,
    input_points_count,
    input_filename,
    output_filename
):
    """
    Generate metadata for K-means analysis including all parameters used.
    
    Args:
        k (int): Number of clusters
        max_iterations (int): Maximum iterations
        init_method (str): Initialization method
        distance_metric (str): Distance metric used
        convergence_tolerance (float): Convergence tolerance
        random_seed (int): Random seed used
        input_points_count (int): Number of input points
        input_filename (str): Name of input file
        output_filename (str): Name of output file
    """
    parameters = {
        "numberOfClusters": k,
        "maxIterations": max_iterations,
        "initializationMethod": init_method,
        "distanceMetric": distance_metric,
        "convergenceTolerance": convergence_tolerance,
        "randomSeed": random_seed
    }
    
    input_data_info = {
        "description": "Input points dataset",
        "sourceFile": input_filename,
        "numberOfPoints": input_points_count
    }
    
    output_data_info = {
        "description": "K-means clustering results",
        "outputFile": output_filename,
        "format": "GeoJSON"
    }
    
    metadata = generate_kmeans_metadata(
        parameters,
        input_data_info,
        output_data_info
    )
    
    # Save metadata alongside the results
    metadata_filename = output_filename.rsplit('.', 1)[0] + '_metadata.json'
    save_metadata(metadata, metadata_filename)
    
    return metadata
