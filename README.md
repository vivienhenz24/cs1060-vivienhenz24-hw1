# Hospital Finder

A Next.js web application that helps users find the nearest hospital and provides driving directions using Google Maps API.

## Features

- 🗺️ Interactive Google Maps integration
- 📍 Automatic geolocation detection
- 🏥 Find nearest hospital within 5km radius
- 🧭 Turn-by-turn driving directions
- 📱 Responsive design with Tailwind CSS
- ⚡ Fast and modern UI

## Setup Instructions

### 1. Get a Google Maps API Key

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - Maps JavaScript API
   - Places API (New) - for hospital search
   - Directions API
4. Create credentials (API Key)
5. Restrict the API key to your domain for security
6. **Important**: Make sure to enable billing for your project as the new Places API requires billing to be enabled

### 2. Configure Environment Variables

1. Copy the `.env.local` file:
   ```bash
   cp .env.local.example .env.local
   ```

2. Add your Google Maps API key to `.env.local`:
   ```
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_actual_api_key_here
   ```

### 3. Install Dependencies

```bash
npm install
```

### 4. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## How to Use

1. Click the "Find the Nearest Hospital" button
2. Allow location access when prompted
3. The app will:
   - Center the map on your location
   - Search for hospitals within 5km
   - Show the nearest hospital with a marker
   - Display driving directions to the hospital

## Technologies Used

- **Next.js 15** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Google Maps JavaScript API** - Maps and places
- **Google Places API** - Hospital search
- **Google Directions API** - Route planning

## Project Structure

```
src/
├── app/
│   ├── layout.tsx      # Root layout
│   ├── page.tsx        # Main hospital finder component
│   └── globals.css     # Global styles
```

## API Requirements

Make sure your Google Maps API key has access to:
- Maps JavaScript API
- Places API (New) - for hospital search using modern API
- Directions API (for route planning)
- **Note**: The new Places API requires billing to be enabled on your Google Cloud project

## Browser Compatibility

- Modern browsers with geolocation support
- HTTPS required for geolocation (production)
- JavaScript enabled

## License

MIT License