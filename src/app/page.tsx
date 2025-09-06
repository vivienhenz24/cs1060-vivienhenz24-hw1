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
    console.log('🏥 Starting hospital search...');
    console.log('🗺️ Map available:', !!map);

    if (!map) {
      setError('Map not initialized properly');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get user's current location
      console.log('📍 Getting user location...');
      const location = await getUserLocation();
      console.log('📍 User location obtained:', location.toString());
      setUserLocation(location);

      // Center map on user location
      map.setCenter(location);
      map.setZoom(15);
      console.log('🗺️ Map centered on user location');

      // Import AdvancedMarkerElement
      console.log('📦 Importing AdvancedMarkerElement...');
      const { AdvancedMarkerElement } = await google.maps.importLibrary("marker") as google.maps.MarkerLibrary;
      console.log('✅ AdvancedMarkerElement imported:', AdvancedMarkerElement);

      // Add user location marker using AdvancedMarkerElement
      console.log('📍 Creating user location marker...');
      new AdvancedMarkerElement({
        position: location,
        map: map,
        title: 'Your Location',
      });
      console.log('✅ User location marker created');

      // Search for nearby hospitals using new Places API
      console.log('🏥 Importing Places API...');
      const { Place } = await google.maps.importLibrary("places") as google.maps.PlacesLibrary;
      console.log('✅ Places API imported:', Place);
      
      const request = {
        locationRestriction: {
          center: location,
          radius: 5000 // 5km radius
        },
        includedPrimaryTypes: ['hospital'],
        fields: ['displayName', 'location', 'formattedAddress', 'id']
      };

      console.log('🔍 Places API request:', request);
      const { places } = await Place.searchNearby(request);
      console.log('🏥 Places API results:', places);
      console.log('🏥 Places count:', places?.length || 0);
      
      if (places && places.length > 0) {
        const hospital = places[0];
        console.log('🏥 First hospital found:', hospital);
        console.log('🏥 Hospital properties:', Object.keys(hospital));
        console.log('🏥 Hospital location:', hospital.location);
        console.log('🏥 Hospital displayName:', hospital.displayName);
        console.log('🏥 Hospital formattedAddress:', hospital.formattedAddress);
        
        setNearestHospital(hospital);

        // Add hospital marker using AdvancedMarkerElement
        console.log('🏥 Creating hospital marker...');
        console.log('🏥 Hospital location for marker:', hospital.location);
        
        try {
          new AdvancedMarkerElement({
            position: hospital.location,
            map: map,
            title: hospital.displayName || 'Hospital',
          });
          console.log('✅ Hospital marker created successfully');
        } catch (markerError) {
          console.error('❌ Error creating hospital marker:', markerError);
          setError(`Error creating hospital marker: ${markerError instanceof Error ? markerError.message : 'Unknown error'}`);
          setIsLoading(false);
          return;
        }

        // Get route to the hospital using new Routes API
        console.log('🧭 Getting route to hospital...');
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
            travelMode: 'DRIVING', // JS Routes library uses DRIVING, not DRIVE
            fields: ['path', 'distanceMeters', 'durationMillis']
          };

          console.log('🧭 Route request:', routeRequest);
          const { routes } = await Route.computeRoutes(routeRequest);
          console.log('🧭 Route response:', routes);

          if (routes && routes.length > 0) {
            const route = routes[0];
            console.log('🧭 Route details:', route);
            console.log('🧭 Route path:', route.path);
            
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
              
              console.log('✅ Route rendered successfully');
            } else {
              console.error('❌ No route path returned');
              setError('Could not get route path to the hospital');
            }
          } else {
            console.error('❌ No routes found');
            setError('Could not find route to the hospital');
          }
        } catch (routeError) {
          console.error('❌ Route error:', routeError);
          setError(`Could not get route to the hospital: ${routeError instanceof Error ? routeError.message : 'Unknown error'}`);
        }
      } else {
        console.log('❌ No hospitals found');
        setError('No hospitals found nearby');
      }

      setIsLoading(false);

    } catch (err) {
      console.error('❌ Error in findNearestHospital:', err);
      console.error('❌ Error type:', typeof err);
      console.error('❌ Error constructor:', err?.constructor?.name);
      console.error('❌ Error name:', err instanceof Error ? err.name : 'Unknown');
      console.error('❌ Error message:', err instanceof Error ? err.message : 'Unknown error');
      console.error('❌ Error stack:', err instanceof Error ? err.stack : 'No stack trace');
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-3xl font-bold text-gray-900">Hospital Finder</h1>
          <p className="text-gray-600 mt-2">Find the nearest hospital and get directions</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="p-6 border-b">
            <button
              onClick={findNearestHospital}
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Finding Hospital...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Find the Nearest Hospital
                </>
              )}
            </button>
            
            {error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-800">{error}</p>
              </div>
            )}

            {nearestHospital && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <h3 className="font-semibold text-green-800">Nearest Hospital Found:</h3>
                <p className="text-green-700">{nearestHospital.displayName}</p>
                {nearestHospital.formattedAddress && (
                  <p className="text-sm text-green-600">{nearestHospital.formattedAddress}</p>
                )}
              </div>
            )}

            {/* Debug Panel */}
            <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <h3 className="font-semibold text-gray-800 mb-2">Debug Information:</h3>
              <div className="text-sm text-gray-600 space-y-1">
                <p>API Key: {process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? '✅ Present' : '❌ Missing'}</p>
                <p>Map: {map ? '✅ Initialized' : '❌ Not initialized'}</p>
                <p>User Location: {userLocation ? `✅ ${userLocation.toString()}` : '❌ Not obtained'}</p>
                <p>Nearest Hospital: {nearestHospital ? `✅ ${nearestHospital.displayName}` : '❌ Not found'}</p>
                {nearestHospital && (
                  <div className="mt-2 p-2 bg-white rounded border">
                    <p className="font-semibold">Hospital Details:</p>
                    <p>Location: {nearestHospital.location ? nearestHospital.location.toString() : 'No location'}</p>
                    <p>Display Name: {nearestHospital.displayName || 'No display name'}</p>
                    <p>Formatted Address: {nearestHospital.formattedAddress || 'No address'}</p>
                    <p>Properties: {Object.keys(nearestHospital).join(', ')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="h-96 w-full" ref={mapRef}>
            {!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && (
              <div className="h-full flex items-center justify-center bg-gray-100">
                <div className="text-center">
                  <p className="text-gray-600 mb-2">Google Maps API key not configured</p>
                  <p className="text-sm text-gray-500">Please add your API key to .env.local</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
