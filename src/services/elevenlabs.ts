import axios from "axios";

const ELEVEN_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY;
const ELEVEN_API_URL = "https://api.elevenlabs.io/v1/text-to-speech";

export async function generateSpeech(text: string, voiceId = "21m00Tcm4TlvDq8ikWAM") {
  const response = await axios.post(
    `${ELEVEN_API_URL}/${voiceId}`,
       {
      text,
       "model_id": "eleven_multilingual_v2",
        "voice_settings": {
        "stability": 0.5,
        "similarity_boost": 0.8,
        "style": 0.0,
        "use_speaker_boost": true
      },
    
      generation_config: {
        speed: 2.0
      }
    },
    {
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": ELEVEN_API_KEY,
      },
      responseType: "arraybuffer",
    }
  );

  return new Blob([response.data], { type: "audio/mpeg" });
}
