export async function getCurrentTime(): Promise<{ currentTime: string }> {
  return { currentTime: new Date().toISOString() };
}

export async function handleMessage(
  message: string,
): Promise<{ currentTime: string } | { response: string }> {
  if (message.toLowerCase().includes("time")) {
    return getCurrentTime();
  }

  return { response: "I could not understand the request." };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(await handleMessage("What time is it?"));
}
