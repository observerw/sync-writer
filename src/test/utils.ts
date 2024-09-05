export async function* randomTextGenerator(
  count: number = 10,
  intervalMs: number = 20
): AsyncGenerator<string> {
  for (let i = 0; i < count; i++) {
    yield `chunk${i}`;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
