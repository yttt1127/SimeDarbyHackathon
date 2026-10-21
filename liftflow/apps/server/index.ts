import { createApp } from './api';
const app = createApp();
app.server.listen(3001, '127.0.0.1', () => console.log('Liftflow backend ready: http://127.0.0.1:3001'));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => void app.close().then(() => process.exit(0)));
