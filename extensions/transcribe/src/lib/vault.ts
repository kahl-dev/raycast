import fs from "fs/promises";
import path from "path";

export interface ProtocolFile {
  path: string;
  name: string;
  mtimeMs: number;
}

export async function listProtocols(dir: string): Promise<ProtocolFile[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (error) {
    throw new Error(`Could not read protocols directory "${dir}": ${error instanceof Error ? error.message : String(error)}`);
  }

  const protocols: ProtocolFile[] = [];
  for (const name of entries) {
    if (path.extname(name).toLowerCase() !== ".md") continue;
    const filePath = path.join(dir, name);
    const stats = await fs.stat(filePath);
    protocols.push({ path: filePath, name, mtimeMs: stats.mtimeMs });
  }

  protocols.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return protocols;
}

export async function latestProtocol(dir: string): Promise<ProtocolFile | null> {
  const protocols = await listProtocols(dir);
  return protocols[0] ?? null;
}
