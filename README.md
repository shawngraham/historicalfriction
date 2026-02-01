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
the historical layers around you.

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
