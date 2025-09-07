# Hospital Finder
 
Hi! I'm Vivien Henz, I worked on this project alone. My github username is vivienhenz24 and you can reach me at vhenz@college.harvard.edu

For this project, I used Cursor as my IDE and gen AI tool, and also used a bit of ChatGPT for general questions about my code.

The github repo url: https://github.com/vivienhenz24/cs1060-vivienhenz24-hw1
The netlify deployment url: https://cs-1060-hw1-vivienhenz24.netlify.app

I worked on an application that uses the google maps API. Basically, you click one button and it will find the nearest hospital to you and give you directions (As well as alternative nearby hospitals).

The biggest issue I encountered was that cursor actually tried to use a bunch of deprecated google maps APIs (for example the one that maps the route from one place to another) In these cases, I had to add console logging to figure out first why I was getting API errors, and then searched with chatgpt what were the new APIs I was supposed to use.

In total this project took me 3.5 hours, but that's because I spent time trying to make it look good. I'd estimate the bulk of the work was done in 2 hours.

Here are the instructions for running the app locally.

1. Add your Google Maps API key to `.env.local`:
   ```
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_actual_api_key_here
   ```

###  Install Dependencies

```bash
npm install
```

### Run the Development Server

```bash
npm run dev
```

## How to Use

1. Click the "Find the Nearest Hospital" button
2. Allow location access when prompted
3. The app will:
   - Center the map on your location
   - Search for hospitals within 5km
   - Show the nearest hospital with a marker
   - Display driving directions to the hospital


## Project Structure

```
src/
├── app/
│   ├── layout.tsx      # Root layout
│   ├── page.tsx        # Main hospital finder component
│   └── globals.css     # Global styles
```

