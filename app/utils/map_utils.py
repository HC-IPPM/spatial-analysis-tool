import folium
from folium.plugins import MarkerCluster
from branca.element import Figure
import json
from datetime import datetime
import pandas as pd

def create_base_map():
    """Create base map centered on Canada with layer control."""
    m = folium.Map(
        location=[56.130366, -106.346771],
        zoom_start=4,
        tiles='OpenStreetMap',
        control_scale=True
    )
    return m

def prepare_geodataframe(gdf):
    """Prepare GeoDataFrame for JSON serialization."""
    processed = gdf.copy()

    for col in processed.columns:
        if col != 'geometry':
            # Convert datetime columns to string
            if pd.api.types.is_datetime64_any_dtype(processed[col]):
                processed[col] = processed[col].dt.strftime('%Y-%m-%d %H:%M:%S')
            # Convert TimedeltaIndex to string
            elif isinstance(processed[col].dtype, pd.DatetimeTZDtype):
                processed[col] = processed[col].astype(str)
            # Convert categorical to string
            elif pd.api.types.is_categorical_dtype(processed[col]):
                processed[col] = processed[col].astype(str)
            # Convert any remaining non-serializable types to string
            elif not pd.api.types.is_numeric_dtype(processed[col]):
                processed[col] = processed[col].astype(str)

    return processed

def add_points_to_map(m, points_gdf, layer_name="Points", opacity=1.0):
    """Add points to map with clustering."""
    try:
        # Create a feature group for points
        points_group = folium.FeatureGroup(name=layer_name, show=True)

        # Create marker cluster
        marker_cluster = MarkerCluster().add_to(points_group)

        # Add each point to the marker cluster
        for idx, row in points_gdf.iterrows():
            popup_content = f"Point {idx}"
            if 'name' in row:
                popup_content = f"Name: {row['name']}"
            elif 'id' in row:
                popup_content = f"ID: {row['id']}"

            folium.Marker(
                location=[row.geometry.y, row.geometry.x],
                popup=popup_content,
                tooltip=popup_content,
                opacity=opacity
            ).add_to(marker_cluster)

        # Add the feature group to the map
        points_group.add_to(m)

        # Force a map bounds update
        bounds = points_gdf.total_bounds
        m.fit_bounds([[bounds[1], bounds[0]], [bounds[3], bounds[2]]])

        return points_group
    except Exception as e:
        print(f"Error adding points to map: {str(e)}")
        raise e

def add_boundary_to_map(m, boundary_gdf, layer_name="Boundary", opacity=0.2):
    """Add boundary polygon to map."""
    try:
        boundary_group = folium.FeatureGroup(name=layer_name, show=True)

        # Prepare data for serialization
        processed_gdf = prepare_geodataframe(boundary_gdf)

        style_function = lambda x: {
            'fillColor': '#3388ff',
            'color': '#3388ff',
            'fillOpacity': opacity,
            'weight': 1
        }

        # Convert to GeoJSON and add to map
        geojson_data = json.loads(processed_gdf.to_json())
        folium.GeoJson(
            data=geojson_data,
            style_function=style_function,
            name=layer_name
        ).add_to(boundary_group)

        boundary_group.add_to(m)

        # Update map bounds to include boundary
        bounds = boundary_gdf.total_bounds
        m.fit_bounds([[bounds[1], bounds[0]], [bounds[3], bounds[2]]])

        return boundary_group
    except Exception as e:
        print(f"Error adding boundary to map: {str(e)}")
        raise e

def update_layer_control(m):
    """Update layer control, ensuring only one exists."""
    # Remove existing layer controls
    for item in m._children.copy():
        if isinstance(m._children[item], folium.LayerControl):
            del m._children[item]

    # Add new layer control with expanded options
    folium.LayerControl(collapsed=False).add_to(m)