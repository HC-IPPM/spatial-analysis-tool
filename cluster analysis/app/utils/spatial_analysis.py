import numpy as np
from sklearn.cluster import KMeans, AgglomerativeClustering
import folium
from folium.plugins import HeatMap
from libpysal.weights import Queen
from esda.moran import Moran_Local
import pandas as pd
import geopandas as gpd
import h3
from shapely.geometry import Polygon, mapping

def generate_heatmap(points_gdf):
    """Generate heatmap data from point data."""
    # Extract coordinates for heatmap
    locations = [[point.y, point.x] for point in points_gdf.geometry]
    return {
        'locations': locations,
        'weights': [1] * len(locations)  # Default weight of 1 for each point
    }

def calculate_local_morans_i(points_gdf, boundary_gdf, weight_column=None):
    """
    Calculate Local Moran's I statistics for points within boundary polygons.
    """
    try:
        # Spatial join points to polygons using predicate instead of op
        joined = gpd.sjoin(boundary_gdf, points_gdf, how='left', predicate='contains')

        # Count points per polygon or sum weights if weight column provided
        if weight_column and weight_column in points_gdf.columns:
            # Group by polygon and sum weights
            point_counts = joined.groupby(joined.index)[weight_column].sum().fillna(0)
        else:
            # Count points per polygon
            point_counts = joined.groupby(joined.index).size().fillna(0)

        # Create weight matrix using Queen contiguity
        w = Queen.from_dataframe(boundary_gdf, use_index=True)
        w.transform = 'r'  # Row-standardize weights

        # Calculate Local Moran's I
        li = Moran_Local(point_counts, w)

        # Add results to boundary GeoDataFrame
        results = boundary_gdf.copy()
        results['count'] = point_counts

        # Handle NaN values in results
        results['local_i'] = pd.Series(li.Is).fillna(0)
        results['p_value'] = pd.Series(li.p_sim).fillna(1)  # Set NaN p-values to 1 (not significant)
        results['z_score'] = pd.Series(li.z_sim).fillna(0)
        results['quadrant'] = pd.Series(li.q).fillna(0).astype(int)

        # Add significance and cluster type
        results['is_significant'] = results['p_value'] < 0.05
        results['cluster_type'] = 'Not Significant'

        # Map quadrants to cluster types
        quad_map = {
            1: 'HH',  # High-High
            2: 'LL',  # Low-Low
            3: 'LH',  # Low-High
            4: 'HL'   # High-Low
        }

        # Update cluster types for significant areas
        for quad, label in quad_map.items():
            mask = (results['quadrant'] == quad) & results['is_significant']
            results.loc[mask, 'cluster_type'] = label

        # Add color mapping
        color_map = {
            'HH': '#ff0000',  # Bright red
            'LL': '#0000ff',  # Bright blue
            'LH': '#800080',  # Purple
            'HL': '#ffff00',  # Yellow
            'Not Significant': '#808080'  # Gray
        }
        results['color'] = results['cluster_type'].map(color_map)

        return results
    except Exception as e:
        print(f"Error calculating Local Moran's I: {str(e)}")
        raise e

def generate_h3_hexagons(points_gdf, resolution=8):
    """
    Generate H3 hexagonal grid from point data.
    Args:
        points_gdf: GeoDataFrame with point geometries
        resolution: H3 resolution (0-15), higher numbers mean smaller hexagons
    Returns:
        GeoDataFrame with hexagon geometries and point counts
    """
    try:
        # Convert points to H3 indexes using updated function names
        h3_indexes = [
            h3.latlng_to_cell(point.y, point.x, resolution)
            for point in points_gdf.geometry
        ]

        # Count points per hexagon
        hex_counts = pd.Series(h3_indexes).value_counts()

        # Create hexagon polygons
        hex_polygons = []
        hex_ids = []
        counts = []

        for h3_index in hex_counts.index:
            # Get hexagon boundaries using updated function name
            boundaries = h3.cell_to_boundary(h3_index)
            # Convert boundaries to list of [lon, lat] for GeoJSON
            boundary_coords = [[coord[1], coord[0]] for coord in boundaries]
            # Close the polygon by repeating the first point
            boundary_coords.append(boundary_coords[0])
            # Create polygon from boundaries
            polygon = Polygon(boundary_coords)

            hex_polygons.append(polygon)
            hex_ids.append(h3_index)
            counts.append(hex_counts[h3_index])

        # Create GeoDataFrame with correct CRS
        hex_gdf = gpd.GeoDataFrame({
            'h3_index': hex_ids,
            'point_count': counts,
            'geometry': hex_polygons
        }, crs="EPSG:4326")  # Set CRS to WGS84

        # Calculate weighted metrics if weight column exists
        if 'weight' in points_gdf.columns:
            # Group points by hexagon and calculate mean weight
            point_weights = pd.DataFrame({
                'h3_index': h3_indexes,
                'weight': points_gdf['weight']
            })
            hex_weights = point_weights.groupby('h3_index')['weight'].mean()
            hex_gdf['avg_weight'] = hex_gdf['h3_index'].map(hex_weights)

        return hex_gdf
    except Exception as e:
        print(f"Error generating H3 hexagons: {str(e)}")
        raise e

def perform_constrained_clustering(hex_gdf, n_clusters=5, use_weights=False):
    """
    Perform spatially constrained clustering using hierarchical clustering.
    Args:
        hex_gdf: GeoDataFrame with hexagon geometries
        n_clusters: Number of clusters to generate
        use_weights: Whether to use weights in clustering
    Returns:
        GeoDataFrame with cluster assignments
    """
    try:
        # Create spatial weights matrix
        w = Queen.from_dataframe(hex_gdf)
        w.transform = 'r'  # Row-standardize weights

        # Prepare features for clustering
        features = ['point_count']
        if use_weights and 'avg_weight' in hex_gdf.columns:
            features.append('avg_weight')

        # Scale features
        X = hex_gdf[features].values
        X = (X - X.mean(axis=0)) / X.std(axis=0)

        # Perform constrained clustering
        model = AgglomerativeClustering(
            n_clusters=n_clusters,
            connectivity=w.sparse
        )
        hex_gdf['cluster'] = model.fit_predict(X)

        # Ensure the GeoDataFrame has the correct CRS
        if hex_gdf.crs is None:
            hex_gdf.set_crs("EPSG:4326", inplace=True)

        return hex_gdf
    except Exception as e:
        print(f"Error in constrained clustering: {str(e)}")
        raise e

def perform_kmeans(points_gdf, n_clusters=5):
    """
    Perform K-means clustering on point data.
    Returns cluster statistics and point details with cluster assignments.
    """
    try:
        # Extract coordinates for clustering
        X = np.array([[point.x, point.y] for point in points_gdf.geometry])

        # Get weights if available
        weights = points_gdf['weight'].values if 'weight' in points_gdf.columns else None

        # Perform clustering
        kmeans = KMeans(n_clusters=n_clusters, random_state=42)
        cluster_labels = kmeans.fit_predict(X)

        # Calculate cluster statistics
        cluster_stats = []
        for i in range(n_clusters):
            cluster_points = points_gdf[cluster_labels == i]
            center = kmeans.cluster_centers_[i]
            stats = {
                'cluster_id': i,
                'points_count': len(cluster_points),
                'center_lat': float(center[1]),  # y coordinate is latitude
                'center_lon': float(center[0]),  # x coordinate is longitude
                'avg_weight': float(cluster_points['weight'].mean()) if weights is not None else None
            }
            cluster_stats.append(stats)

        # Prepare point details
        points_data = []
        for idx, (point, cluster) in enumerate(zip(points_gdf.geometry, cluster_labels)):
            point_data = {
                'point_id': idx,
                'latitude': float(point.y),
                'longitude': float(point.x),
                'cluster': int(cluster),
                'weight': float(points_gdf.iloc[idx]['weight']) if weights is not None else None
            }
            points_data.append(point_data)

        return cluster_stats, points_data
    except Exception as e:
        print(f"Error in K-means clustering: {str(e)}")
        return [], []