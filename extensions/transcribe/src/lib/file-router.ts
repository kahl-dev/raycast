import path from "path";

export type Route = "convert" | "audio";

export class UnsupportedFileError extends Error {}

const CONVERT_EXTENSIONS = [".docx", ".txt", ".vtt"];
const AUDIO_EXTENSIONS = [".wav", ".m4a", ".mp3", ".mp4", ".flac"];

export function routeFile(filePath: string): Route {
  const extension = path.extname(filePath).toLowerCase();

  if (CONVERT_EXTENSIONS.includes(extension)) return "convert";
  if (AUDIO_EXTENSIONS.includes(extension)) return "audio";

  const supported = [...CONVERT_EXTENSIONS, ...AUDIO_EXTENSIONS].join(", ");
  throw new UnsupportedFileError(`Unsupported file extension "${extension}". Supported extensions: ${supported}`);
}
