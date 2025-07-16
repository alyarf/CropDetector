# FUNCȚII PE CARE LE VOI FOLOSI PENTRU A FACE CERERI CĂTRE SENTINEL HUB API
# 1.
def get_dates_lately(token, geometry, days=90, limit=100):
    now = datetime.now(timezone.utc).date()
    start_date = now - timedelta(days=days)

    url = "https://services.sentinel-hub.com/api/v1/catalog/search"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    body = {
        "collections": ["sentinel-2-l2a"],
        "intersects": geometry, 
        "datetime": f"{start_date.isoformat()}T00:00:00Z/{now.isoformat()}T23:59:59Z",
        "limit": limit 
    }
    response = requests.post(url, headers=headers, json=body)

    if response.status_code != 200:
       raise Exception(f"Failed to fetch data: {response.status_code} - {response.text}")

    features = response.json().get("features", [])
    dates = sorted({f["properties"]["datetime"].split("T")[0] for f in features if "datetime" in f["properties"]})

    return dates


def build_evalscript_b4_b8():
    return """
    //VERSION=3
    function setup() {
        return {
            input: ["B04", "B08", "SCL"],
            output: { bands: 3, sampleType: "FLOAT32" }
        };
    }

    function evaluatePixel(sample) {
        return [sample.B04, sample.B08, sample.SCL];
    }
    """

# 2.
def ndvi_map(field, date_str):
    try:
        date = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        raise ValueError("Invalid date format.")
    
    
    from_date = to_date = date.strftime("%Y-%m-%d")
    geometry = field.geojson.get("geometry", field.geojson) 
    evalscript = build_evalscript_b4_b8()
    
    headers = {
        "Authorization": f"Bearer {settings.SENTINEL_OAUTH_TOKEN}",
        "Content-Type": "application/json"
    }

    body = {
        "input": {
            "bounds": {
                "geometry": geometry,
                "properties": { "crs": "http://www.opengis.net/def/crs/EPSG/0/4326" }
            },
            "data": [{
                "type": "sentinel-2-l2a",
                "dataFilter": {
                    "timeRange": {
                        "from": f"{from_date}T00:00:00Z",
                        "to": f"{to_date}T23:59:59Z"
                    },
                    "maxCloudCoverage": 20
                }
            }]
        },
        "output": {
            "width": 512,
            "height": 512,
            "responses": [{
                "identifier": "default",
        "format": {
            "type": "image/tiff",
            "parameters": {
                "compression": "LZW",
                "depth": "float32"  # or "float" for some APIs
            }
        }
    }]
        },
        "evalscript": evalscript
    }
    
    response = requests.post(
            "https://services.sentinel-hub.com/api/v1/process", #aici in process poti cere benzi
            headers=headers,
            json=body,
            timeout=30  # Add timeout to prevent hanging requests
        )

    if response.status_code != 200: 
        raise Exception(f"Failed to retrieve data: {response.text}")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".tif") as temp:
        temp.write(response.content)
        temp_path = temp.name
       

    try:
        with rasterio.open(temp_path) as src:
            if not src.crs or not src.transform:
                raise ValueError(
                    "The selected field area is too close to the edge or outside valid satellite data for this date. "
                    "Please try redrawing the field slightly further inland or choose a different date."
                )

            b4 = src.read(1).astype(np.float32) 
            b8 = src.read(2).astype(np.float32)
            scl = src.read(3).astype(np.uint8)
            
            # Cloud-related SCL values (mai mult decat 1):
            cloud_classes=[3, 8, 9, 10, 11, 12] # 3: umbra, 8-12: cloud/snow
            cloud_mask = np.isin(scl, cloud_classes).astype(np.uint8)
            

            # Calculate NDVI ONLY on non-cloudy pixels!!!!
            mask = (b8 + b4 != 0) & (cloud_mask == 0)
            ndvi = np.zeros_like(b8)
            ndvi[mask] = (b8[mask] - b4[mask]) / (b8[mask] + b4[mask])
            

            # Mask pixels outside polygon
            polygon_geometry = field.geojson["geometry"]
            polygon_shape = shape(polygon_geometry)
            outside_mask = rasterio.features.geometry_mask(
                [polygon_shape],
                out_shape=ndvi.shape,
                transform=src.transform,
                invert=True
            )

            ndvi[~outside_mask] = np.nan
            cloud_mask[~outside_mask] = 0 # outside field = not cloudy

            cloud_json = cloud_mask.tolist()

            valid_ndvi = ndvi[~np.isnan(ndvi) & (ndvi >= -1.0) & (ndvi <= 1.0)]
            if len(valid_ndvi) > 0:
                ndvi_mean = float(np.mean(valid_ndvi))
                ndvi_max = float(np.max(valid_ndvi))
                ndvi_min = float(np.min(valid_ndvi))
            else:
                ndvi_mean = ndvi_max = ndvi_min = None

            ndvi_json_safe = np.where(np.isnan(ndvi), None, ndvi).tolist()
            
            return {
                "ndvi_data": ndvi_json_safe,
                "ndvi_mean": ndvi_mean,
                "ndvi_max": ndvi_max,
                "ndvi_min": ndvi_min,
                "date": date_str,
                "cloud_data": cloud_json
            }
    finally:
        os.remove(temp_path)

# VIEW PENTRU A SALVA MAI INTAI IN TABEL TOATE DATELE VENITE DE LA API:
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def build_ndvi_tables(request, pk):
    try:
        field = get_object_or_404(Field, pk=pk, user=request.user)
        geometry = field.geojson.get("geometry", field.geojson)
        token = getattr(settings, 'SENTINEL_OAUTH_TOKEN', None)

        if not token:
            return Response({"error": "Sentinel OAuth token not configured"}, status=500)
        
        try:
            dates = get_dates_lately(token, geometry, days=180)
        except Exception as date_error:
            logger.error(f"get_dates_lately failed: {str(date_error)}")
            return Response({"error": f"Failed to fetch dates: {str(date_error)}"}, status=500)

        if not dates:
            return Response({"error": "No dates returned from Sentinel API"}, status=404)

        total_processed = 0
        for date_str in dates:
            try:
                date_obj = datetime.strptime(date_str, "%Y-%m-%d").date()

                season = Season.objects.filter(
                    start_date__lte = date_obj,
                    end_date__gte = date_obj
                ).first()

                record, _ = NDVIRecord.objects.get_or_create(field=field, date=date_str,
                                                                   defaults={"season":season})

                if record.ndvi_mean is not None and record.ndvi_data:
                    continue
                
                if record.season is None:
                    record.season=season

                output = ndvi_map(field, date_str)

                record.ndvi_mean = output.get("ndvi_mean")
                record.ndvi_min = output.get("ndvi_min")
                record.ndvi_max = output.get("ndvi_max")
                record.ndvi_data = output.get("ndvi_data")
                record.cloud_data = output.get("cloud_data")
                record.save()
                total_processed += 1

            except Exception as err:
                logger.error(f"Error processing NDVI for date {date_str}: {err}")
                continue

        return Response({'total_dates': len(dates),
                         'dates': dates})
    
    except Field.DoesNotExist:
        return Response({"error": "Field not found!"}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        logger.error(f"General error during sync: {e}")
        return Response({"error": f"Error: {str(e)}"}, status=500)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_ndvi_record(request, pk):
    date_str = request.query_params.get("date")
    if not date_str:
        return Response({"error": "Missing date parameter ?date=YYYY-MM-DD"}, status=400)

    try:
        date_obj = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        return Response({"error": "Invalid date format. Use YYYY-MM-DD."}, status=400)

    field = get_object_or_404(Field, pk=pk, user=request.user)

    record = NDVIRecord.objects.filter(field=field, date=date_obj).first()

    if record is None:
        return Response(
            {"error": "NDVI not found for this date. Run the sync endpoint first."},
            status=status.HTTP_404_NOT_FOUND)

    if not record.ndvi_data:
        return Response({"message": "NDVI record exists but data not populated yet. "
                         "Processing may still be running."}, status=status.HTTP_202_ACCEPTED,)

    return Response(NDVISerializer(record).data, status=200)

# pentru a returna NDVImin și NDVImax:
from datetime import date
from django.db.models import Min, Max
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def ndvi_stats(request, pk):
    days = int(request.query_params.get("days", 90))
    since = date.today() - timedelta(days=days)

    field = get_object_or_404(Field, pk=pk, user=request.user)

    stats = (NDVIRecord.objects
             .filter(field=field, date__gte=since)
             .aggregate(global_min=Min('ndvi_min'),
                        global_max=Max('ndvi_max')))

    return Response({
        "ndvi_min": stats["global_min"],
        "ndvi_max": stats["global_max"],
    })

