export default async function globalTeardown() {
  await globalThis.__PA_TEST_DB__?.stop();
}
