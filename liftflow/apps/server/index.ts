import { createApp } from './api';
import { resolveRuntimeConfig } from './runtime';

const runtime = resolveRuntimeConfig(process.env);
const app = createApp(undefined, runtime);
app.server.listen(runtime.port, runtime.host, () => console.log(`Liftflow listening on ${runtime.host}:${runtime.port}`));

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => void app.close().then(() => process.exit(0)));
