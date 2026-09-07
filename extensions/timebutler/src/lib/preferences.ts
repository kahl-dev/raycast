import { getPreferenceValues } from "@raycast/api";

export interface Preferences {
  tbUser: string;
  tbPassword: string;
  tbUserId: string;
  tbIcalUrl: string;
  tbInstance: string;
  skillPath: string;
  uvBinary: string;
}

export function getPrefs(): Preferences {
  return getPreferenceValues<Preferences>();
}

export function tbEnv(prefs: Preferences): NodeJS.ProcessEnv {
  return {
    ...process.env,
    LIA_TIMEBUTLER_USER: prefs.tbUser,
    LIA_TIMEBUTLER_PASSWORD: prefs.tbPassword,
    LIA_TIMEBUTLER_USER_ID: prefs.tbUserId,
    LIA_TIMEBUTLER_ICAL_URL: prefs.tbIcalUrl,
    LIA_TIMEBUTLER_INSTANCE: prefs.tbInstance,
  };
}
