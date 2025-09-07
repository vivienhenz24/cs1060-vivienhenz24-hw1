'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

export default function Home() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [userLocation, setUserLocation] = useState<google.maps.LatLng | null>(null);
  const [nearestHospital, setNearestHospital] = useState<google.maps.places.Place | null>(null);
  const [nearbyHospitals, setNearbyHospitals] = useState<google.maps.places.Place[]>([]); // other 3
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  interface DirectionStep {
    instruction: string;
    distance: string;
    duration: string;
  }
  
  const [directions, setDirections] = useState<DirectionStep[]>([]);

  // Keep route polyline and hospital markers to clean up between runs
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);
  const hospitalMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]); // markers for the 3 others
  const selectedHospitalMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);

  useEffect(() => {
    const initMap = async () => {
      const loader = new Loader({
        apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
        version: 'beta', // Use beta for Routes API
        libraries: ['places', 'marker', 'routes', 'geometry']
      });

      try {
        const google = await loader.load();
        
        if (mapRef.current) {
          const mapInstance = new google.maps.Map(mapRef.current, {
            center: { lat: 37.7749, lng: -122.4194 }, // Default to San Francisco
            zoom: 13,
            mapId: 'DEMO_MAP_ID' // Required for AdvancedMarkerElement
          });

          setMap(mapInstance);
          // No longer need DirectionsService and DirectionsRenderer
          // We'll use the new Routes API instead
        }
      } catch (err) {
        setError('Failed to load Google Maps. Please check your API key.');
        console.error('Error loading Google Maps:', err);
      }
    };

    initMap();
  }, []);

  const getUserLocation = (): Promise<google.maps.LatLng> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser.'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = new google.maps.LatLng(
            position.coords.latitude,
            position.coords.longitude
          );
          resolve(location);
        },
        (error) => {
          reject(new Error('Error getting user location: ' + error.message));
        }
      );
    });
  };

  const clearHospitalMarkers = () => {
    try {
      hospitalMarkersRef.current.forEach((m) => {
        if (!m) return;
        // AdvancedMarkerElement is removed by setting map to null
        m.map = null;
      });
    } catch {}
    hospitalMarkersRef.current = [];
  };

  const clearRoutePolyline = () => {
    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null);
      routePolylineRef.current = null;
    }
  };

  const setSelectedHospitalMarker = async (hospital: google.maps.places.Place) => {
    if (!map || !hospital?.location) return;
    try {
      const { AdvancedMarkerElement } = await google.maps.importLibrary("marker") as google.maps.MarkerLibrary;
      if (selectedHospitalMarkerRef.current) {
        selectedHospitalMarkerRef.current.map = null;
        selectedHospitalMarkerRef.current = null;
      }
      selectedHospitalMarkerRef.current = new AdvancedMarkerElement({
        position: hospital.location,
        map,
        title: (typeof hospital.displayName === 'string' ? hospital.displayName : (hospital.displayName as unknown as { text?: string })?.text) || 'Selected hospital',
      });
    } catch {}
  };

  const routeToHospital = async (hospital: google.maps.places.Place, location: google.maps.LatLng) => {
    if (!map || !hospital?.location) return;
    setNearestHospital(hospital);
    setError(null);
    setDirections([]);
    

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const routesLibrary = await google.maps.importLibrary('routes') as any;
      const Route = routesLibrary.Route;

      const origin = { lat: location.lat(), lng: location.lng() };
      const destination = { lat: hospital.location.lat(), lng: hospital.location.lng() };

      const routeRequest = {
        origin,
        destination,
        travelMode: 'DRIVING',
        fields: ['path', 'distanceMeters', 'durationMillis', 'legs'],
        routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
        computeAlternativeRoutes: false,
        routeModifiers: { avoidTolls: false, avoidHighways: false, avoidFerries: false },
      };

      const { routes } = await Route.computeRoutes(routeRequest);
      if (!routes || routes.length === 0) {
        setError('Could not find route to the hospital');
        return;
      }

      const route = routes[0];

      const steps: DirectionStep[] = [];
      if (route.legs && route.legs.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        route.legs.forEach((leg: any) => {
          if (leg.steps) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            leg.steps.forEach((step: any) => {
              const instruction = step.instructions || 'Continue';
              steps.push({
                instruction,
                distance: step.distanceMeters ? `${Math.round(step.distanceMeters)}m` : '',
                duration: step.durationMillis ? `${Math.round(step.durationMillis / 1000)}s` : '',
              });
            });
          }
        });
      }
      setDirections(steps);

      // Draw route polyline replacing any previous one
      clearRoutePolyline();
      if (route.path && route.path.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const path = route.path.map((point: any) => ({ lat: point.lat, lng: point.lng }));
        routePolylineRef.current = new google.maps.Polyline({
          map,
          path,
          strokeOpacity: 1,
          strokeWeight: 6,
          strokeColor: '#4285F4',
        });
      }

      // Fit map to both points
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(location);
      bounds.extend(hospital.location);
      map.fitBounds(bounds);

      // Update the selected hospital marker
      await setSelectedHospitalMarker(hospital);
    } catch (routeError) {
      setError(`Could not get route to the hospital: ${routeError instanceof Error ? routeError.message : 'Unknown error'}`);
    }
  };

  const findNearestHospital = async () => {
    if (!map) {
      setError('Map not initialized properly');
      return;
    }

    setIsLoading(true);
    setError(null);
    setDirections([]);

    try {
      // Get user's current location
      const location = await getUserLocation();
      setUserLocation(location);

      // Center map on user location initially
      map.setCenter(location);
      map.setZoom(13);

      // Import AdvancedMarkerElement
      const { AdvancedMarkerElement } = await google.maps.importLibrary("marker") as google.maps.MarkerLibrary;

      // Add user location marker using AdvancedMarkerElement
      new AdvancedMarkerElement({
        position: location,
        map: map,
        title: 'Your Location',
      });

      // Search for nearby hospitals using new Places API
      const { Place } = await google.maps.importLibrary("places") as google.maps.PlacesLibrary;
      
      const request = {
        locationRestriction: {
          center: location,
          radius: 12000 // Wider net to allow filtering (~12km)
        },
        includedPrimaryTypes: ['hospital'],
        // Ensure results are ordered by distance; otherwise popularity is used
        rankPreference: google.maps.places.SearchNearbyRankPreference.DISTANCE,
        maxResultCount: 20,
        // Request extra fields so we can filter out imposters
        fields: [
          'displayName',
          'location',
          'formattedAddress',
          'id',
          'primaryType',
          'types',
          'businessStatus',
          'rating',
          'userRatingCount'
        ]
      };

      console.log('🏥 Searching for hospitals with request:', request);
      let places: google.maps.places.Place[] | undefined;
      try {
        const response = await Place.searchNearby(request);
        places = response.places;
        console.log('🏥 Places API response:', places);
        console.log('🏥 Number of places found:', places ? places.length : 0);
      } catch (searchError) {
        console.error('❌ Error searching for hospitals:', searchError);
        setError(`Error searching for hospitals: ${searchError instanceof Error ? searchError.message : 'Unknown error'}`);
        setIsLoading(false);
        return;
      }
      
      if (places && places.length > 0) {
        const looksLikeHospital = (p: google.maps.places.Place): boolean => {
          // Must be operational
          if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') return false;
          // Type check: primaryType or types should include hospital
          const primaryOk = p.primaryType === 'hospital';
          const typesOk = Array.isArray(p.types) && p.types.includes('hospital');
          if (!primaryOk && !typesOk) return false;

          // Heuristic: exclude entries that look like a person's name
          const name = (typeof p.displayName === 'string') ? p.displayName : ((p.displayName as unknown as { text?: string })?.text || '');
          const suspicious = /^(?:[A-Z][a-z]+)\s+(?:[A-Z][a-z]+)(?:\s+[A-Z][a-z]+)?$/.test(name) &&
                             !/(Hospital|Medical|Clinic|Center|Centre|Health|Med|Regional|Urgent|ER|Children|General)/i.test(name);
          if (suspicious) return false;

          // Heuristic: require some community signal when available
          if (typeof p.userRatingCount === 'number' && p.userRatingCount < 5) return false;
          return true;
        };

        let filtered = places.filter(looksLikeHospital);
        // Fallback if filtering is too strict
        if (filtered.length === 0) filtered = places;

        // Use filtered list for further processing
        places = filtered;

        // Defensive: sort by actual distance in case API does not
        // strictly return by distance. Requires geometry library.
        try {
          const sorted = [...places].sort((a, b) => {
            if (!a.location || !b.location) return 0;
            const da = google.maps.geometry.spherical.computeDistanceBetween(location, a.location);
            const db = google.maps.geometry.spherical.computeDistanceBetween(location, b.location);
            return da - db;
          });
          places = sorted;
        } catch {
          // If geometry library not available, proceed with API order
        }
        // Keep 3 others after the nearest, ensuring 4 unique total
        const others = places.slice(1, 4);
        setNearbyHospitals(others);

        // Clear existing hospital markers then add new ones
        clearHospitalMarkers();
        try {
          others.forEach((p: google.maps.places.Place, idx: number) => {
            if (!p.location) return;
            const marker = new AdvancedMarkerElement({
              position: p.location,
              map: map,
              title: (typeof p.displayName === 'string' ? p.displayName : (p.displayName as unknown as { text?: string })?.text) || `Hospital ${idx + 1}`,
            });
            // Route on marker click
            marker.addListener?.('gmp-click', () => routeToHospital(p, location));
            hospitalMarkersRef.current.push(marker);
          });
        } catch (markerError) {
          console.error('Marker error', markerError);
        }

        // Default to the closest one
        const hospital = places[0];
        console.log('🏥 First hospital found:', hospital);
        await routeToHospital(hospital, location);
      } else {
        console.log('❌ No hospitals found nearby');
        setError('No hospitals found nearby');
      }

      setIsLoading(false);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Sidebar */}
      <div className="w-80 bg-white border-r flex flex-col">
        <div className="p-6 border-b">
          <h1 className="text-xl text-gray-900 mb-1">Hospital Finder</h1>
          <p className="text-sm text-gray-600">Find the nearest hospital and get directions</p>
        </div>
        
        <div className="p-6 flex-1">
          <button
            onClick={findNearestHospital}
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 mb-6"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Finding Hospital...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Find Nearest Hospital</span>
              </>
            )}
          </button>
          
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          {nearestHospital && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded">
              <div className="text-green-800">
                <div className="text-sm text-green-600 mb-2">Nearest Hospital Found</div>
                <div className="text-lg mb-2">{nearestHospital.displayName}</div>
                {nearestHospital.formattedAddress && (
                  <div className="text-sm text-green-600 mb-3">{nearestHospital.formattedAddress}</div>
                )}
                <div className="text-xs text-green-600">Routing shown on map →</div>
              </div>
            </div>
          )}

          {nearbyHospitals.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm text-gray-700 mb-3">Other nearby hospitals</h3>
              <div className="space-y-2">
                {nearbyHospitals.map((h, i) => (
                  <button
                    key={h.id || i}
                    onClick={() => userLocation && routeToHospital(h, userLocation)}
                    className="w-full text-left p-3 rounded border hover:bg-blue-50 hover:border-blue-200 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-800">{typeof h.displayName === 'string' ? h.displayName : (h.displayName as unknown as { text?: string })?.text || 'Hospital'}</div>
                        {h.formattedAddress && (
                          <div className="text-xs text-gray-500">{h.formattedAddress}</div>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">#{i + 1}</div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="text-xs text-gray-500 mt-2">Tip: Click a hospital to route.</div>
            </div>
          )}
        </div>
      </div>

      {/* Right Side - Map */}
      <div className="flex-1 relative">
        <div className="absolute inset-0" ref={mapRef}>
          {!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && (
            <div className="h-full flex items-center justify-center bg-gray-100">
              <div className="text-center p-6">
                <div className="text-gray-500 mb-2">Google Maps API key required</div>
                <div className="text-sm text-gray-400">Add your API key to .env.local</div>
              </div>
            </div>
          )}
          {/* Directions overlay on top-right of map */}
          {directions.length > 0 && (
            <div className="absolute top-4 right-4 w-80 max-h-[70vh] overflow-y-auto bg-transparent">
              <div className="px-2 mb-2">
                <div className="text-sm text-black">Directions</div>
              </div>
              <div className="p-2 space-y-2">
                {directions.map((step, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-white/20 backdrop-blur-md border border-white/30 shadow-sm">
                    <div className="flex-shrink-0 w-6 h-6 bg-blue-100/80 text-blue-700 rounded-full flex items-center justify-center text-xs">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <div className="text-gray-900">{step.instruction}</div>
                      {(step.distance || step.duration) && (
                        <div className="text-xs text-gray-700 mt-1">
                          {step.distance && <span>{step.distance}</span>}
                          {step.distance && step.duration && <span> • </span>}
                          {step.duration && <span>{step.duration}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
