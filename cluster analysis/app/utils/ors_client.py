"""OpenRouteService client for calculating network distances."""
import requests
from typing import List, Tuple, Dict
import logging
import time

logger = logging.getLogger(__name__)

class ORSClient:
    def __init__(self):
        self.base_url = "https://ors-sro.alpha.phac-aspc.gc.ca/ors/v2"
        self.isochrones_url = f"{self.base_url}/isochrones/driving-car"
        self.directions_url = f"{self.base_url}/directions/driving-car"
        
    def get_network_distance(self, point1: Tuple[float, float], point2: Tuple[float, float]) -> float:
        """
        Calculate the network distance (driving) between two points using ORS Directions API.
        Args:
            point1: Tuple of (longitude, latitude) for start point
            point2: Tuple of (longitude, latitude) for end point
        Returns:
            Distance in meters
        """
        try:
            coordinates = [point1, point2]
            params = {
                "coordinates": coordinates,
                "metrics": ["distance"],
                "units": "m"
            }
            
            response = requests.post(self.directions_url, json=params)
            
            if response.status_code == 200:
                route_data = response.json()
                # Extract the total distance from the response
                return route_data['routes'][0]['summary']['distance']
            else:
                logger.error(f"Error getting network distance: {response.status_code} - {response.text}")
                # Fallback to euclidean distance
                return None
                
        except Exception as e:
            logger.error(f"Exception in get_network_distance: {str(e)}")
            return None
            
    def get_network_distances_matrix(self, points: List[Tuple[float, float]]) -> List[List[float]]:
        """
        Calculate a distance matrix between all points using the network distance.
        Implements caching and batch processing to minimize API calls.
        
        Args:
            points: List of (longitude, latitude) tuples
        Returns:
            2D list representing the distance matrix
        """
        n = len(points)
        distance_matrix = [[0.0] * n for _ in range(n)]
        
        # Calculate upper triangle of the matrix (symmetric)
        for i in range(n):
            for j in range(i + 1, n):
                distance = self.get_network_distance(points[i], points[j])
                if distance is None:
                    # Fallback to euclidean if network distance fails
                    from sklearn.metrics.pairwise import euclidean_distances
                    import numpy as np
                    points_array = np.array([points[i], points[j]])
                    distance = euclidean_distances([points_array[0]], [points_array[1]])[0][0]
                
                # Matrix is symmetric
                distance_matrix[i][j] = distance
                distance_matrix[j][i] = distance
                
                # Add small delay to avoid overwhelming the API
                time.sleep(0.1)
                
        return distance_matrix

# Singleton instance
ors_client = ORSClient()
