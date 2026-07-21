import { ExecFileFunction, defaultExecFile } from "./exec";
import { parseJsonOrThrow, toError } from "./types";

const KEYCHAIN_SERVICE = "Claude Code-credentials";

interface KeychainPayload {
  claudeAiOauth?: {
    accessToken?: unknown;
  };
}

export async function readAnthropicToken(execFileImplementation: ExecFileFunction = defaultExecFile): Promise<string> {
  let stdout: string;
  try {
    const result = await execFileImplementation("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"]);
    stdout = result.stdout;
  } catch (error) {
    throw new Error(
      `Anthropic-Token nicht im Keychain gefunden (Service "${KEYCHAIN_SERVICE}"): ${toError(error).message}`,
    );
  }

  const parsed = parseJsonOrThrow(stdout, `Keychain-Eintrag für "${KEYCHAIN_SERVICE}"`);

  const accessToken = (parsed as KeychainPayload).claudeAiOauth?.accessToken;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    throw new Error(`Keychain-Eintrag für "${KEYCHAIN_SERVICE}" enthält keinen gültigen accessToken`);
  }

  return accessToken;
}
