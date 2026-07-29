export interface SwitchDependencies {
  notePick(deviceName: string): Promise<void>;
  revertPick(): Promise<void>;
  switchToDevice(deviceId: string): Promise<boolean>;
}

// Intent must land BEFORE the daemon's debounced (~0.5s) evaluation, so notePick is awaited
// first — noting it after the switch risks losing the race to a coinciding hardware event.
// A failed switch must not leave a phantom "sacred pick" behind for the daemon to restore onto,
// so any non-success path (false result or thrown rejection) reverts the announcement. Revert,
// not clear: the user may already have had a valid pick that this attempt displaced, and dropping
// that one too would demote them to AUTO and let the next hardware event move their audio.
export async function performSwitch(
  deps: SwitchDependencies,
  deviceId: string,
  deviceName: string,
): Promise<boolean> {
  await deps.notePick(deviceName);

  let switched: boolean;
  try {
    switched = await deps.switchToDevice(deviceId);
  } catch {
    switched = false;
  }

  if (!switched) {
    await deps.revertPick();
    return false;
  }

  return true;
}
