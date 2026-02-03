Hey, this one was neat but the whole 'voice control' thing didn't really pan out. Go see the version at [https://github.com/xlabCU/historicalfriction](https://github.com/xlabCU/historicalfriction) instead. 



Historical Friction
==

> History is all around us. The voices of the past thicken the air, calling out
> for your attention. When it all gets too much, pull the ear-buds out, stop,
> and look at where you are with fresh eyes, in the new silence...

Historical Friction is a web app that makes physical space *thick* by
auralizing the digital data streams it finds. As you walk, the app discovers
nearby Wikipedia articles via GeoNames and renders them as sound — overlapping
voices, ambient drones, generative music, or ghostly whispers.

You can also **talk back to the past** using on-device voice recognition
(powered by [Moonshine JS](https://dev.moonshine.ai/js/)), asking questions
like *"what's here?"* or *"tell me about the river"* to filter and explore
the historical layers around you. (**still glitchy**)

## Sonification Modes

| Mode | Description |
|------|-------------|
| **Voices** | The classic: each article is spoken aloud at a random pitch via the Web Speech API. Multiple articles overlap, creating a cacophony of the past arguing with itself. |
| **Drone** | Articles become ambient tones via the Web Audio API. Distance maps to frequency, summary length to volume, and compass bearing to stereo panning. Dense historical areas hum; empty spaces go quiet. |
| **Music** | Articles map to notes on a pentatonic scale. Distance sets the pitch, word count sets the rhythm. Walking composes a unique generative piece. |
| **Whisper** | TTS at very low volume and slow rate — ghostly, half-intelligible murmurs. You catch fragments. The past as half-heard rumor. |

## Voice Commands

Tap the microphone button to enable voice interaction. Speech recognition runs
entirely in your browser via Moonshine JS (no cloud, no data leaves your device).

| Say... | Effect |
|--------|--------|
| *"What's here?"* | Hear the closest article clearly |
| *"Tell me about [topic]"* | Filter articles matching your keyword |
| *"Clear filter"* / *"Show all"* | Remove the keyword filter |
| *"Silence"* / *"Stop"* | Pause all audio |
| *"Play"* / *"Resume"* | Start audio again |
| *"Voices"* / *"Drone"* / *"Music"* / *"Whisper"* | Switch sonification mode |
| *"Louder"* / *"Softer"* | Adjust volume |
| *"More"* / *"Closer"* | Expand or contract the search radius |
| *"What am I hearing?"* | Name the currently sounding articles |

## Running Locally

```bash
npx serve .
```

Then open [http://localhost:3000](http://localhost:3000). You'll need to allow
location access and (for voice commands) microphone access.

## How It Works

- **Geolocation**: `navigator.geolocation.watchPosition()` tracks your movement
- **Data**: [GeoNames API](https://www.geonames.org/) finds nearby Wikipedia articles
- **TTS**: Native `speechSynthesis` Web Speech API (Voices and Whisper modes)
- **Sonification**: Web Audio API oscillators, filters, panners, and reverb (Drone and Music modes)
- **Voice recognition**: [Moonshine JS](https://dev.moonshine.ai/js/) — on-device ASR via ONNX Runtime Web
- **Image detection**: Wikipedia API checks which articles need photos (highlighted in the UI)

## Walkthrough
When a user lands on **Historical Friction**, selects **"Drone"**, and hits **"Play"**, the app initiates a complex chain of data retrieval and digital signal processing (DSP). 

Here is the step-by-step lifecycle of that interaction:

### Step 1: Geographic Anchoring (The Fetch)
As soon as the user interacts, the browser’s **Geolocation API** is triggered.
*   **Data Pulled:** The phone’s GPS coordinates (Latitude/Longitude).
*   **Transformation:** These coordinates are formatted into an API request sent to **Wikipedia's Geosearch API**.
*   **Result:** Wikipedia returns a JSON list of the nearest historical articles (e.g., "The Old Town Hall," "Site of 1842 Riot"). Each item includes its own Lat/Lon and a snippet of text.

### Step 2: Audio Context "Unlocking"
Browsers block audio from playing automatically. The user’s "Play" tap is the "User Gesture" required to unlock the **Web Audio API**.
*   **Transformation:** The `AudioContext` is instantiated.
*   **The Master Chain:** The app builds a virtual "mixing desk" in the phone's memory:
    1.  **Dynamics Compressor:** To prevent the "cacophony" from distorting or blowing out the phone's tiny speakers.
    2.  **Master Gain:** The volume fader.
    3.  **Convolver (Reverb):** The app generates a 3-second "Impulse Response" (a mathematical model of a hall) using random white noise that decays exponentially. This gives the sounds a "ghostly" physical space.

### Step 3: Global Pulse Connection (The Stream)
While the local articles are loading, the app opens a **Server-Sent Events (SSE)** connection to `stream.wikimedia.org`.
*   **Data Pulled:** A real-time "heartbeat" of every edit happening on Wikipedia globally (thousands per minute).
*   **Transformation:** The app ignores the text of the edits and looks only at the **"Delta"** (how many characters were added or removed). This is mapped to a variable called `_globalFriction`.

### Step 4: Spatializing the History (The Mapping)
For every Wikipedia article found nearby, a unique **"Voice"** is created in the `sonification.js` engine.
1.  **Panning (Left to Right):** The app compares the user's GPS heading to the article's GPS location. 
    *   *Math:* If the article is at a 90° angle to the user, the `StereoPannerNode` shifts that voice entirely to the right ear.
2.  **Pitch (Distance):**
    *   *Logic:* Articles 10 meters away are mapped to a low, heavy 60Hz thrum. Articles 500 meters away are mapped to a thinner 220Hz hum. This creates a "gravity" effect—the closer you are to a site, the "heavier" the air feels.
3.  **Timbre (Waveform):** 
    *   *Transformation:* The app takes the Article Title (e.g., "Market Square") and generates a **Hash** (a number derived from the text). 
    *   *Result:* This number picks the waveform: "Market Square" might be a `sine` wave (smooth), while "Bloody Sunday" might be a `sawtooth` wave (harsh/buzzing).

### Step 5: The "Breathing" Environment (The Final Mix)
Now the "Drone" is running, but it isn't static. It is being modulated by the global edit stream in real-time.
*   **The Modulation Loop:** 60 times per second (`requestAnimationFrame`), the app checks the `_globalFriction` level.
*   **The Transformation:** 
    *   If someone in Japan just deleted 5,000 words from a Wikipedia page, `_globalFriction` spikes. 
    *   The **Low-Pass Filters** on all your drones "open up."
    *   **Result:** The user hears the background drone suddenly become bright, fizzy, and intense for a second, before "cooling down" (decaying) back into a muffled thrum.

### Summary of the User Experience:
The user stands in a park. They hear a **heavy, low-frequency buzz** in their left ear (a nearby monument) and a **hollow, smooth whistle** in their right ear (a distant church). As they stand there, the entire soundscape **"breathes" and shimmers** in brightness—an auditory ghost of the global friction of people writing history in real-time.

## Credits

Built on [ici](https://github.com/edsu/ici) by Ed Summers. The original idea
for "historical friction" is detailed at
[Electric Archaeology](https://electricarchaeology.ca/2013/04/24/historical-friction/).

Shawn Graham & [Stuart Eve](https://www.dead-mens-eyes.org/) created the
original speak.js-powered version. This modernized version replaces the 2013-era
stack (jQuery, Bootstrap 2, CoffeeScript, Emscripten-compiled eSpeak) with
vanilla ES6+, Web Audio API, Web Speech API, and Moonshine JS.

## License

[![cc0](https://licensebuttons.net/p/zero/1.0/88x31.png)](https://creativecommons.org/publicdomain/zero/1.0/)

To the extent possible under law, the authors have waived all copyright and
related rights to this work.
