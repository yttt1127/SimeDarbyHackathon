import { useEffect, useState } from 'react';
import type { Snapshot } from '../../../packages/shared/types';

export function useLive() {
  const [state, setState] = useState<Snapshot>();
  const [connected, setConnected] = useState(false);
  const [session, setSession] = useState<{ token: string; sessionId: string }>();
  const [operator, setOperator] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let closed = false, socket: WebSocket | undefined, timer: ReturnType<typeof setTimeout>;
    async function connect() {
      try {
        const saved = sessionStorage.getItem('liftflow-session');
        let current = saved ? JSON.parse(saved) : undefined;
        if (current) {
          const check = await fetch('/api/operator/me', { headers: { 'X-Session-Token': current.token } });
          if (check.ok) setOperator((await check.json()).operator === true);
          else current = undefined;
        }
        if (!current) {
          const response = await fetch('/api/session', { method: 'POST' });
          if (!response.ok) throw new Error('Could not start local session');
          current = await response.json();
          setOperator(current.operator === true);
          sessionStorage.setItem('liftflow-session', JSON.stringify(current));
        }
        if (closed) return;
        setSession(current);
        socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
        socket.onopen = () => { setConnected(true); setError(''); };
        socket.onmessage = event => { if (!closed) setState(JSON.parse(event.data)); };
        socket.onclose = () => { if (!closed) { setConnected(false); timer = setTimeout(connect, 1500); } };
        socket.onerror = () => socket?.close();
      } catch {
        if (!closed) { setError('Connecting to the local simulation server…'); timer = setTimeout(connect, 1500); }
      }
    }
    void connect();
    return () => { closed = true; clearTimeout(timer); socket?.close(); };
  }, []);
  async function command(path: string, data: unknown) {
    if (!connected || !session) { setError('Wait for the live connection before sending a command.'); return false; }
    try {
      const response = await fetch('/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Session-Token': session.token }, body: JSON.stringify(data) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (path === 'operator/login') setOperator(result.operator === true);
      setError(''); return true;
    } catch (error) { setError(error instanceof Error ? error.message : 'Command failed'); return false; }
  }
  return { state, connected, session, operator, error, setError, command };
}
