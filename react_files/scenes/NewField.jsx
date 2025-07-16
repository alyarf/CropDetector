import { Box, Typography, TextField, Snackbar, Alert, useTheme } from "@mui/material";
import { useEffect, useRef, useState } from 'react';
import { tokens } from "../../theme";
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';

import 'leaflet-control-geocoder';
import 'leaflet-control-geocoder/dist/Control.Geocoder.css';

const NewField = () => {
    const theme = useTheme();
    const colors = tokens(theme.palette.mode);

    const mapContainerRef = useRef(null);
    const drawnItemsRef = useRef(null);
    const [map, setMap] = useState(null);
    const [mapInitialized, setMapInitialized] = useState(false);

    const [fieldName, setFieldName] = useState('');
    const [notification, setNotification] = useState({ open: false, message: '', severity: 'success' });

    useEffect(() => {
              if (mapContainerRef.current && !mapInitialized) {
               
                const timer = setTimeout(() => { 
                    try{initializeMap(); 
                        setMapInitialized(true);
                    } catch(error){
                        console.error("Map initialization error:", error);
                        showNotification("Error initializing map. Please refresh the page.", "error");
                    }
                }, 500);
                return () => clearTimeout(timer);
            }
        }, [mapInitialized]);

    const initializeMap = () => {
        if (map || !mapContainerRef.current) return;
        
        try{
            const leafletMap = L.map(mapContainerRef.current, {
                center: [45.9432, 24.9668],
                zoom: 6,
                attributionControl: true,
                zoomControl: false
            });
            
            L.control.zoom({
                position: 'topright', 
            }).addTo(leafletMap);
                
            L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: 'Tiles © Esri',
                maxZoom: 19
            }).addTo(leafletMap);
            
            L.tileLayer(
            'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
            {
                attribution: 'Labels © Esri',
                pane: 'overlayPane'
            }
            ).addTo(leafletMap);
            
            const searchBar = new L.Control.geocoder({
                placeholder: 'Introduceți o adresă sau un oraș..',
                collapsed: false,
                position: 'topleft',
                text: 'Address Search',
            defaultMarkGeocode: false
            }).addTo(leafletMap);    

            // handle geocoding result event
            searchBar.on('markgeocode', function(e) {
                const center= e.geocode.center;
                leafletMap.setView(center, 15);
            });

            const drawnItems = new L.FeatureGroup();
            drawnItemsRef.current = drawnItems;
            drawnItems.addTo(leafletMap);

            const drawControl = new L.Control.Draw({
                draw: {
                    polygon: {
                      allowIntersection: false,
                      showArea: true,
                      shapeOptions: {
                            weight: 3,
                            opacity: 0.9,
                            fillOpacity: 0.4

                      }
                    },
                    polyline: false,
                    rectangle: false,
                    circle: false,
                    marker: false,
                    circlemarker: false,
                },
                edit: {
                    featureGroup: drawnItems,
                    poly: {
                        allowIntersection: false
                    }
                }
            });
            
            leafletMap.addControl(drawControl);
            
            leafletMap.on(L.Draw.Event.CREATED, (event) => {
                const layer = event.layer;
                if (layer) {
                    drawnItems.addLayer(layer);
                }
            });

            setTimeout(() => {
                leafletMap.invalidateSize(true);
            }, 500);
            
            setMap(leafletMap);
        } catch (error){
            showNotification("Error initializing map", "error");}
    };
    
    useEffect(() => {
        if (!map) return;
        
        const handleResize = () => {
            map.invalidateSize(true);
        };
        
        window.addEventListener('resize', handleResize);
        
        return () => {
            window.removeEventListener('resize', handleResize);
            map.remove();
        };
    }, [map]);
      
    const showNotification = (message, severity = 'success') => {
        setNotification({
            open: true,
            message: message,
            severity: severity
        });
    };

    const handleCloseNotification = () => {
        setNotification({...notification, open: false});
    };

    
  const getCookie = (name) => {
      let cookieValue = null;
      if (document.cookie && document.cookie !== '') {
          const cookies = document.cookie.split(';');
          for (let cookie of cookies) {
              cookie = cookie.trim();
              if (cookie.startsWith(name + '=')) {
                  cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                  break;
              }
          }
      }
      return cookieValue;
  };
  
    const sendToGeoJSON = () => {
        if(!fieldName.trim){
          showNotification("Please enter a field name", "error");
          return;
        }
        
        if (!drawnItemsRef.current || drawnItemsRef.current.getLayers().length === 0){
            showNotification("Please draw a field on the map first", "error");
            return;
        }

        const geojsonData = drawnItemsRef.current.toGeoJSON();
        
        if (geojsonData.features.length === 0) {
            showNotification("Error creating GeoJSON data", "error");
            return;
        }
        
        // CALCULAM ha:
        let area = 0;
        try{
            const layer = drawnItemsRef.current.getLayers()[0];
            // Calcum suprafata in m2
            area = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]);
            // Convertim in hectare
            area = (area / 10000).toFixed(2);
        }catch(e){
            console.error("Eroare la calculul suprafetei:", e);
            area = "Unknown";
        }

        const fieldData = {
            name: fieldName, 
            location: "Romania",
            size: `${area}`,
            geojson: geojsonData.features[0],  // doar polygonul
          };
        
        fetch('http://localhost:8000/api/fields/', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json',
                        "X-CSRFToken": getCookie("csrftoken")
             },
            
            body: JSON.stringify(fieldData), // ce i trimitem in spate formatat!!!
        })

        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            showNotification(`Terenul "${data.name}" a fost salvat cu succes!`);
            setFieldName('');
            handleClearAll();
        })
        .catch(error => {
            showNotification('Eroare la salvarea terenului: ' + error.message, 'error');
        });
    };
      
    const handleClearAll = () => {
        if (drawnItemsRef.current) {
            drawnItemsRef.current.clearLayers();
        }
    };

    return (
            <Box m="20px" display = "flex" flexDirection="column"  >
                <Box sx={{ height: '50px'}}>
                    <Header title="Adăugați o parcelă nouă" />
                </Box>
            
              <Box display="flex" flexDirection="column" alignItems="center"
                sx={{ height:'70px', width: '500px'}}>
                    <Typography variant="h5" color="secondary" sx={{fontWeight:'bold',   marginBottom: '0.1rem',}}>
                    În această secțiune puteți salva <i>parcele noi</i>, pe care le puteți vizualiza ulterior în pagina
                     "Parcele salvate"
                    </Typography>
                </Box>

              <Box display="flex" mt ="20px">
                <Box display="flex" flexDirection="column" alignItems="center"
                    sx={{
                      borderRadius:'8px',
                      height:'260px',
                      width: '600px',
                      marginRight: '20px',
                      padding: '20px',
                      backgroundColor: colors.main[300],
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                    }}>
                    <Typography variant="h5"  sx={{fontWeight:'bold', marginBottom:'10px', color: colors.orange[100]}}>
                        <center>Pentru a salva o parcelă, folosiți-vă de instrumentul de desenat 
                    </center></Typography>
    
                        <TextField
                            label="Nume câmp"
                            variant="outlined"
                            value={fieldName}
                            onChange={(e) => setFieldName(e.target.value)}
                            fullWidth
                            margin="normal"
                            sx={{
                                height: '55px',
                                width: '300px',
                                backgroundColor: 'white',
                                borderRadius: '5px',
                                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                                marginBottom: '30px',
                                '& .MuiInputBase-input': {
                                    fontSize: '18px',
                                    fontWeight: 'bold',
                                    color: 'black',
                                },
                                '& .MuiInputLabel-root': {
                                    color: 'gray',
                                },
                                '& .MuiOutlinedInput-notchedOutline': {
                                    borderColor: '#ffffff00', 
                                    },

                            }}
                        />
                            <Box display="flex"> 
                            <button 
                              onClick={sendToGeoJSON} 
                              style={{ 
                                  marginBottom: 10, 
                                  padding: '12px 24px',
                                  fontSize: '16px',
                                  backgroundColor: '#FF9F1F',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                                  cursor: 'pointer'
                              }}
                          >
                              Salvează
                          </button>
                          
                          <button 
                              onClick={handleClearAll}
                              style={{ 
                                  marginBottom: 10, 
                                  padding: '12px 24px',
                                  fontSize: '16px',
                                  backgroundColor: '#f44336',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                                  cursor: 'pointer',
                                  marginLeft: '30px'
                              }}
                          >
                              Anulează
                          </button>
                          </Box>
                  </Box>

                 <Box
                    ref={mapContainerRef}
                    sx={{
                        height: '400px',
                        width: '80%',
                        borderRadius: '12px',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                        marginLeft: '80px',
                        overflow: 'hidden',
                        position: 'relative',
                    }}
                    ></Box>

              </Box>

              <Snackbar
                    open={notification.open} 
                    autoHideDuration={6000} 
                    onClose={handleCloseNotification}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
              >
                <Alert
                    onClose = {handleCloseNotification}
                    severity = {notification.severity}
                    sx={{ fontSize: '16px', width: '100%' }}
                    > {notification.message}
                </Alert>
              </Snackbar>
            </Box>

    );
};

export default NewField;
