// Shared validation helpers for settings fields.
// Used by both the public mutation (users.ts) and the internal Telegram mutation.

const TIME_REGEX = /^\d{2}:\d{2}$/;

export function validateTimezone(tz: string): void {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
  } catch {
    throw new Error("Invalid timezone");
  }
}

export function validateDigestTime(digestTime: string): void {
  if (!TIME_REGEX.test(digestTime)) throw new Error("digestTime must be HH:MM");
  const [h, m] = digestTime.split(":").map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) throw new Error("digestTime out of range");
}
