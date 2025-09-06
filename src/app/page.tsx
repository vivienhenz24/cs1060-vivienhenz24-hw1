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
          radius: 5000 // 5km radius
        },
        includedPrimaryTypes: ['hospital'],
        fields: ['displayName', 'location', 'formattedAddress', 'id']
      };

      const { places } = await Place.searchNearby(request);
      
      if (places && places.length > 0) {
        const hospital = places[0];
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
            fields: ['path', 'distanceMeters', 'durationMillis']
          };

          const { routes } = await Route.computeRoutes(routeRequest);

          if (routes && routes.length > 0) {
            const route = routes[0];
            
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
        setError('No hospitals found nearby');
      }

      setIsLoading(false);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white shadow-lg border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center">
            <h1 className="text-4xl text-gray-900 mb-2">🏥 Hospital Finder</h1>
            <p className="text-gray-600 text-lg">Find the nearest hospital and get driving directions instantly</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-xl shadow-xl overflow-hidden">
          <div className="p-8">
            <div className="text-center mb-6">
              <button
                onClick={findNearestHospital}
                disabled={isLoading}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-500 text-white py-4 px-8 rounded-xl transition-all duration-300 transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed flex items-center gap-3 mx-auto shadow-lg"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span className="text-lg">Finding Hospital...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="text-lg">Find the Nearest Hospital</span>
                  </>
                )}
              </button>
            </div>
            
            {error && (
              <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-400 rounded-lg">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {nearestHospital && (
              <div className="mb-6 p-6 bg-gradient-to-r from-green-50 to-emerald-50 border-l-4 border-green-400 rounded-lg">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg text-green-800 mb-2">✅ Nearest Hospital Found!</h3>
                    <p className="text-green-700 text-lg">{nearestHospital.displayName}</p>
                    {nearestHospital.formattedAddress && (
                      <p className="text-green-600 mt-1">{nearestHospital.formattedAddress}</p>
                    )}
                    <div className="mt-3 flex items-center text-sm text-green-600">
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Route displayed on map below
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>

          <div className="h-[500px] w-full" ref={mapRef}>
            {!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && (
              <div className="h-full flex items-center justify-center bg-gray-100">
                <div className="text-center p-8">
                  <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <h3 className="text-lg text-gray-900 mb-2">Google Maps API Key Required</h3>
                  <p className="text-gray-600 mb-4">Please add your Google Maps API key to the .env.local file</p>
                  <div className="bg-gray-50 p-4 rounded-lg text-left max-w-md mx-auto">
                    <p className="text-sm text-gray-700 font-mono">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_api_key_here</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
