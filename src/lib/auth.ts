export function verifyApiKey(headers: Headers): boolean {
  const apiKey = headers.get("x-api-key");
  return apiKey === process.env.API_KEY;
}

export function verifyTriggerKey(headers: Headers): boolean {
  const triggerKey = headers.get("x-trigger-key");
  return triggerKey === process.env.TRIGGER_KEY;
}
