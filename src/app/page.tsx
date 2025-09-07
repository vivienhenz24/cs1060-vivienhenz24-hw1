'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

export default function Home() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [userLocation, setUserLocation] = useState<google.maps.LatLng | null>(null);
  const [nearestHospital, setNearestHospital] = useState<google.maps.places.Place | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  interface DirectionStep {
    instruction: string;
    distance: string;
    duration: string;
  }
  
  const [directions, setDirections] = useState<DirectionStep[]>([]);
  const [routeInfo, setRouteInfo] = useState<{distance: string, duration: string} | null>(null);

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

  const findNearestHospital = async () => {
    if (!map) {
      setError('Map not initialized properly');
      return;
    }

    setIsLoading(true);
    setError(null);
    setDirections([]);
    setRouteInfo(null);

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
          radius: 8000 // Search within ~8km; adjust as needed
        },
        includedPrimaryTypes: ['hospital'],
        // Ensure results are ordered by distance; otherwise popularity is used
        rankPreference: 'DISTANCE' as const,
        maxResultCount: 20,
        fields: ['displayName', 'location', 'formattedAddress', 'id']
      };

      console.log('🏥 Searching for hospitals with request:', request);
      let places;
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
        } catch (e) {
          // If geometry library not available, proceed with API order
        }

        const hospital = places[0];
        console.log('🏥 First hospital found:', hospital);
        setNearestHospital(hospital);

        // Add hospital marker using AdvancedMarkerElement
        try {
          new AdvancedMarkerElement({
            position: hospital.location,
            map: map,
            title: hospital.displayName || 'Hospital',
          });

          // Fit map bounds to show both user location and hospital
          if (hospital.location) {
            const bounds = new google.maps.LatLngBounds();
            bounds.extend(location);
            bounds.extend(hospital.location);
            map.fitBounds(bounds);
            
            // Add some padding to the bounds
            const listener = google.maps.event.addListener(map, 'bounds_changed', () => {
              const currentBounds = map.getBounds();
              if (currentBounds) {
                const ne = currentBounds.getNorthEast();
                const sw = currentBounds.getSouthWest();
                const latDiff = ne.lat() - sw.lat();
                const lngDiff = ne.lng() - sw.lng();
                
                // Add 20% padding
                const latPadding = latDiff * 0.2;
                const lngPadding = lngDiff * 0.2;
                
                const newBounds = new google.maps.LatLngBounds(
                  new google.maps.LatLng(sw.lat() - latPadding, sw.lng() - lngPadding),
                  new google.maps.LatLng(ne.lat() + latPadding, ne.lng() + lngPadding)
                );
                
                map.fitBounds(newBounds);
                google.maps.event.removeListener(listener);
              }
            });
          }
        } catch (markerError) {
          setError(`Error creating hospital marker: ${markerError instanceof Error ? markerError.message : 'Unknown error'}`);
          setIsLoading(false);
          return;
        }

        // Get route to the hospital using new Routes API
        if (!hospital.location) {
          setError('Hospital location not available');
          setIsLoading(false);
          return;
        }

        try {
          // Import Routes library
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const routesLibrary = await google.maps.importLibrary('routes') as any;
          
          const Route = routesLibrary.Route;

          // Convert LatLng objects to the format expected by Routes API
          const origin = { 
            lat: location.lat(), 
            lng: location.lng() 
          };
          const destination = { 
            lat: hospital.location.lat(), 
            lng: hospital.location.lng() 
          };

          const routeRequest = {
            origin: origin,
            destination: destination,
            travelMode: 'DRIVING',
            fields: ['path', 'distanceMeters', 'durationMillis', 'legs'],
            routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
            computeAlternativeRoutes: false,
            routeModifiers: {
              avoidTolls: false,
              avoidHighways: false,
              avoidFerries: false
            }
          };

          const { routes } = await Route.computeRoutes(routeRequest);

          if (routes && routes.length > 0) {
            const route = routes[0];
            
            
            // Extract route information
            const distance = route.distanceMeters ? `${Math.round(route.distanceMeters / 1000 * 10) / 10} km` : 'Unknown distance';
            const duration = route.durationMillis ? `${Math.round(route.durationMillis / 60000)} min` : 'Unknown duration';
            setRouteInfo({ distance, duration });
            
            // Extract step-by-step directions
            const steps: DirectionStep[] = [];
            if (route.legs && route.legs.length > 0) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              route.legs.forEach((leg: any) => {
                if (leg.steps) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  leg.steps.forEach((step: any) => {
                    // Use the instructions field directly from the step
                    const instruction = step.instructions || 'Continue';
                    
                    steps.push({
                      instruction: instruction,
                      distance: step.distanceMeters ? `${Math.round(step.distanceMeters)}m` : '',
                      duration: step.durationMillis ? `${Math.round(step.durationMillis / 1000)}s` : ''
                    });
                  });
                }
              });
            }
            setDirections(steps);
            
            if (route.path && route.path.length > 0) {
              // Convert LatLngAltitude points to LatLngLiteral for Polyline
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const path = route.path.map((point: any) => ({ 
                lat: point.lat, 
                lng: point.lng 
              }));
              
              // Draw the route on the map
              new google.maps.Polyline({
                map: map,
                path: path,
                strokeOpacity: 1,
                strokeWeight: 6,
                strokeColor: '#4285F4'
              });
            } else {
              setError('Could not get route path to the hospital');
            }
          } else {
            setError('Could not find route to the hospital');
          }
        } catch (routeError) {
          setError(`Could not get route to the hospital: ${routeError instanceof Error ? routeError.message : 'Unknown error'}`);
        }
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
                {routeInfo && (
                  <div className="flex gap-4 text-sm text-green-600 mb-3">
                    <span>📏 {routeInfo.distance}</span>
                    <span>⏱️ {routeInfo.duration}</span>
                  </div>
                )}
                <div className="text-xs text-green-600">
                  Route displayed on map →
                </div>
              </div>
            </div>
          )}

          {directions.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm text-gray-700 mb-3">Directions</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {directions.map((step, index) => (
                  <div key={index} className="flex items-start gap-3 p-2 bg-gray-50 rounded text-sm">
                    <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <div className="text-gray-800">{step.instruction}</div>
                      {(step.distance || step.duration) && (
                        <div className="text-xs text-gray-500 mt-1">
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
        </div>
      </div>
    </div>
  );
}
