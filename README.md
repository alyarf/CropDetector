# Crop Detector: A Deep Learning App for Crop Type Detection using Satellite Imagery
Crop Detector is a full-stack machine learning web app designed to help monitor and manage agricultural fields using satellite imagery and deep learning. The platform enables users to draw and save field boundaries, track vegetation health using NDVI (Normalized Difference Vegetation Index), and receive crop rotation recommendations—all via an intuitive, map-based interface.

# Key Features of the App:
- Interactive field mapping – Draw, view, and manage land parcels directly on a satellite map.
- NDVI visualization – Monitor plant health using NDVI, computed from Sentinel-2 reflectance data.
- Crop type segmentation – Automatically classify crops using a deep learning model based on multispectral imagery.
- Crop rotation planning – Get smart suggestions for future crops based on current field data.
- Integrated Sentinel Hub API – Fetches up-to-date spectral bands (NDVI, SCL, etc.) and GeoTIFFs using GeoJSON geometries.

# Tech Stack
## Backend
- Django + Django REST Framework
- Model-View-Serializer architecture
- Sentinel Hub API integration

## Frontend
- React
- Leaflet for interactive mapping
- Nivo for dynamic NDVI time series visualization

# How It Works
1. User draws a field, the field gets saved in the database:
![new_field](https://github.com/user-attachments/assets/a897d5f9-e459-4d51-b664-306dc2513b21)
![saved_fields](https://github.com/user-attachments/assets/21816e39-73e6-49df-9626-501c997d93ef)
2. The system fetches Sentinel-2 data (including NDVI and classification layers):
![hover_map](https://github.com/user-attachments/assets/be4c5451-d665-4b87-9f26-bb3504a67c81)
3. Crop segmentation is performed by the deep learning model which allows the users to visualize the predicted crop type and also the NDVI trends for the last 6 months:
 ![plan_rot](https://github.com/user-attachments/assets/15b8e207-58ab-462c-9e1b-607f498ee270)
4. Rotation planning recommends what to plant next (if the option was chosen by the user):
![recomandari](https://github.com/user-attachments/assets/e755bec7-857f-44c6-8556-8f1461ce9cca)


