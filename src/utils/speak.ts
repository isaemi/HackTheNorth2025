// src/utils/speak.ts
import { generateSpeech } from "../services/elevenlabs";
export async function speak(text: string) {
  try {
    const blob = await generateSpeech(text);
    console.log("Blob size:", blob.size);
    const url = URL.createObjectURL(blob);
    console.log("Audio URL:", url);
    const audio = new Audio(url);
    await audio.play();
  } catch (err) {
    console.error("Speech error:", err);
  }
}
