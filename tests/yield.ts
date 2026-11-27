import { afterEach } from 'vitest';

// Let the worker's event loop go round once after every test. A file of long synchronous tests (routes.test.ts walks
// every room for every decoration, about 90 s; repair.test.ts spawns git again and again) otherwise only ever yields
// to microtasks between tests, so vitest's own messages to the main thread get no answer until the file ends, and
// after 60 s it reports `Timeout calling "onTaskUpdate"` as an unhandled error: every test passes and the run fails.
afterEach(() => new Promise<void>((resolve) => setImmediate(resolve)));
