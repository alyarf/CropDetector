import { useEffect, useState } from 'react';
import { Box, Button, Typography, useTheme, Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions} from "@mui/material";
import { tokens } from "../../theme";
import { useNavigate } from 'react-router-dom';
import L from "leaflet"; 
import "leaflet/dist/leaflet.css"; 

const MyFields = () => {
    const theme = useTheme();
    const colors = tokens(theme.palette.mode);
    const [notification, setNotification] = useState({ open: false, message: '', severity: 'success' });


    const [fields, setFields] = useState([]);
    const [mapsInitialized, setMapsInitialized] = useState({});
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [fieldToDelete, setFieldToDelete] = useState(null);
    const [locatie, setLocatie] = useState([]);
    
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

    const handleDelete = async (fieldId) => {
            try {
                const response = await fetch(`http://localhost:8000/api/fields/${fieldId}/`, {
                    method: 'DELETE',
                    credentials: 'include',
                     headers: {
                        "X-CSRFToken": getCookie("csrftoken"),
                    }
                });

                if (response.ok){
                    setFields(prev => prev.filter(f => f.id !== fieldId));
                                         
                    showNotification("Parcela a fost ștearsă cu succes.", "success");
                } else{ 
                     console.log("Deleting field with ID:", fieldId);

                    showNotification("Parcela nu a putut fi ștearsă.", "error");
                }
            } catch(error){
          
                showNotification("A apărut o eroare la ștergere.", "error");
            }
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
  
    const store_location = async (fields) => {
        const locations=[];

        for(const field of fields){
            try{
                const geometry = field.geojson.geometry;
                const fieldId = field.id;

                const response = await fetch(`http://localhost:8000/api/fields/${fieldId}/reverse-geocode/`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                         "X-CSRFToken": getCookie("csrftoken"),
                    },
                    body: JSON.stringify({geometry: geometry})
                });

                const data = await response.json();

                if(response.ok){
                    const locality = data.locality || '';
                    const county = data.county || data.state || '';
                    const country = data.country || '';

                    const parts = [locality, county, country].filter(Boolean);

                    let locatie ="";
                    if(parts.length > 0){
                        locatie = parts.join(', ');
                    }else{
                        locatie = "Locatie necunoscuta";
                    }
                    locations.push(locatie);
                } else{
                    console.error("Reverse geocoding error:", data.error);
                    locations.push("Locatie necunoscuta");
                }
            }catch(error){
                console.error("Error in store_location:", error)
                locations.push("Locatie necunoscuta");
            }
        }
        setLocatie(locations);
    }; 

    useEffect(() => {
        fetch('http://localhost:8000/api/fields/', {
            method: "GET",
            credentials: "include"
        })
          .then(response => response.json())
          .then(data => {
            if (Array.isArray(data)) {
            setFields(data);
            store_location(data);
          } else { setFields([]);}
        })
          .catch(error => {
            console.error('Error fetching fields:', error);
            setFields=([]);
          });
    }, []);

        useEffect(() => {
            if (fields.length === 0) return;

            const timer = setTimeout(() => {
                fields.forEach(field => {
                    const mapId = `mini-map-${field.id}`;
                    const mapContainer = document.getElementById(mapId);
                    
                    if (mapContainer && !mapsInitialized[field.id]) {
                        // Check if container has dimensions
                        if (mapContainer.offsetWidth === 0 || mapContainer.offsetHeight === 0) {
                            console.warn(`Map container ${mapId} has no dimensions`);
                            return;
                        }

                        // Clean up any existing Leaflet instance
                        if (mapContainer._leaflet_id) {
                            delete mapContainer._leaflet_id;
                            mapContainer.innerHTML = '';
                        }
                        //folosim pt a intarzia initializarea hartii, asteptand ca curatarea hartii ant. sa se termine
                        requestAnimationFrame(() => {
                            try {
                                const map = L.map(mapId, {
                                    zoomControl: false,
                                    attributionControl: false,
                                    dragging: false,
                                    scrollWheelZoom: false,
                                    doubleClickZoom: false,
                                    boxZoom: false,
                                    keyboard: false,
                                    tap: false,
                                    touchZoom: false,
                                });

                                // Add invalidateSize after map creation
                                setTimeout(() => {
                                    map.invalidateSize();
                                }, 50);

                                L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                                    attribution: 'Tiles © Esri',
                                    maxZoom: 19
                                }).addTo(map);
                                
                                if (field.geojson && typeof field.geojson === 'object') {
                                    const geoJsonLayer = L.geoJSON(field.geojson).addTo(map);
                        
                                    if (geoJsonLayer.getBounds && geoJsonLayer.getBounds().isValid()) {
                                        map.fitBounds(geoJsonLayer.getBounds());
                                    } else {
                                        map.setView([0, 0], 1);
                                    }
                                } else {
                                    map.setView([0, 0], 1);
                                }
                                
                                setMapsInitialized(prev => ({
                                    ...prev,
                                    [field.id]: true
                                }));
                            } catch (error) {
                                console.error(`Error initializing map for field ${field.id}:`, error);
                            }
                        });
                    }
                });
            }, 300);
            
            return () => clearTimeout(timer);
        }, [fields, mapsInitialized]);
        
        return (
            <Box m="20px" >
                <Box sx={{ height: '50px'}}>
                    <Header title="Parcele salvate" />
                </Box>
                <Box>
                <Typography variant="h5"  mb="10px" color="secondary" sx={{height:'20px', width: '800px', fontWeight:'bold'}}>
                    În această secțiune puteți vizualiza și gestiona parcelele salvate</Typography>
                </Box>
                   
                    <Box display="flex" gap="50px" mt="30px" flexWrap="wrap" alignContent="flex-start">
                     {!Array.isArray(fields) ? (
                            <p>Se încarcă...</p>
                        ) : fields.length > 0 ? (
                        fields.map((field, index) => (
                        <Box 
                            key={field.id}
                            sx={{
                            width: '300px',
                            backgroundColor: 'colors.main[300]',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            boxShadow: '0px 0px 10px rgba(0,0,0,0.3)',
                            }}
                            >
                            
                            <div id={`mini-map-${field.id}`} style={{ 
                                height: '150px', width: '100%',
                                backgroundColor: 'colors.main[300]', // Darker placeholder
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white',
                                fontSize: '24px'
                                }}></div>
                            

                            {/* Field Info */}
                            <Box p="15px">
                                <Typography variant="h6" color="color.white[100]">{field.name}</Typography>
                                <Typography variant="body2" color="gray">Locație: {locatie[index]}</Typography>
                                <Typography variant="body2" color="gray" mb="10px">Dimensiune: {field.size} ha</Typography>
                                
                                {/* BUTOANELE DE VIEW & DELETE */}
                                <Button variant="contained" color="secondary" size="small" sx={{ mr: 1 }}  onClick={() => navigate(`/my-fields/${field.id}`)} >
                                    View
                                </Button>
                                
                                <Button variant="outlined" color="error" size="small"
                                    onClick={() => { setFieldToDelete(field.id);
                                                    setOpen(true);}}>
                                                Șterge
                                </Button>
                                <Dialog open={open} onClose={() => StereoPannerNode(false)}>
                                    <DialogTitle fontSize="20px">Confirmare ștergere</DialogTitle>
                                        <DialogContent >
                                        <DialogContentText > Sigur doriți să ștergeți această parcelă?</DialogContentText>                                    
                                        </DialogContent>
                                    <DialogActions>
                                    <Button variant="outlined" color="warning" size="small" onClick={() => setOpen(false)}>
                                                Anulează </Button>
                                    <Button onClick={() => {
                                        handleDelete(fieldToDelete);
                                        setOpen(false);
                                    }} color="error" autoFocus>                                        
                                        Șterge
                                        
                                    </Button>
                                    </DialogActions>
                                </Dialog>

                            </Box>
                        </Box>
                        )) ) : (<p style={{color: colors.orange[100]}}>Nu există parcele salvate momentan.</p>)}


                          <Snackbar
                            open={notification.open} 
                            autoHideDuration={6000} 
                            onClose={handleCloseNotification}
                            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                            >
                            <Alert
                                onClose = {handleCloseNotification}
                                severity = {notification.severity}
                                sx={{ width: '100%' }}
                            > {notification.message}
                            </Alert>
                            </Snackbar>
            </Box>
        </Box>
    );
};

export default MyFields;
