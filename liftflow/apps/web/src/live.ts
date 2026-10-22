import { useEffect, useRef, useState } from 'react';
import type { Snapshot } from '../../../packages/shared/types';

type Session = { token: string; sessionId: string };
const sessionKey = 'liftflow-session';
const timeoutMs = 12000;

export function useLive() {
  const [state, setState] = useState<Snapshot>();
  const [connected, setConnected] = useState(false);
  const [session, setSession] = useState<Session>();
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const sessionRef = useRef<Session | undefined>(undefined);
  const renewing = useRef<Promise<Session> | null>(null);
  const mounted = useRef(true);

  async function renewSession() {
    if (renewing.current) return renewing.current;
    renewing.current = (async () => {
      const response = await fetch('/api/session', { method: 'POST', signal: AbortSignal.timeout(timeoutMs) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || 'Could not start a session');
      if (typeof value.token !== 'string' || typeof value.sessionId !== 'string') throw new Error('Invalid session response');
      sessionRef.current = value;
      try { sessionStorage.setItem(sessionKey, JSON.stringify(value)); } catch { /* memory-only session remains usable */ }
      if (mounted.current) setSession(value);
      return value as Session;
    })();
    try { return await renewing.current; } finally { renewing.current = null; }
  }

  useEffect(() => {
    mounted.current = true;
    let closed = false, socket: WebSocket | undefined, timer: ReturnType<typeof setTimeout>;
    async function connect() {
      try {
        let current = sessionRef.current;
        if (!current) {
          try {
            const saved = JSON.parse(sessionStorage.getItem(sessionKey) || 'null');
            if (typeof saved?.token === 'string' && typeof saved?.sessionId === 'string') current = saved;
          } catch { /* Discard corrupt storage rather than reconnecting forever. */ }
        }
        if (current) {
          const check = await fetch('/api/alternatives', { headers: { 'X-Session-Token': current.token }, signal: AbortSignal.timeout(timeoutMs) });
          if (check.status === 401) current = undefined;
          else if (!check.ok) throw new Error('Session validation failed');
        }
        if (!current) current = await renewSession();
        if (closed) return;
        sessionRef.current = current;
        setSession(current);
        socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
        // Connection is usable only after its authoritative initial snapshot.
        socket.onmessage = event => {
          if (closed) return;
          try {
            setState(JSON.parse(event.data)); setConnected(true);
            setError(previous => ['Connecting to the simulation server…', 'Invalid live update. Reconnecting…'].includes(previous) ? '' : previous);
          }
          catch { setError('Invalid live update. Reconnecting…'); socket?.close(); }
        };
        socket.onclose = () => { if (!closed) { setConnected(false); timer = setTimeout(connect, 1000); } };
        socket.onerror = () => socket?.close();
      } catch {
        if (!closed) { setConnected(false); setError('Connecting to the simulation server…'); timer = setTimeout(connect, 1500); }
      }
    }
    void connect();
    return () => { closed = true; mounted.current = false; clearTimeout(timer); socket?.close(); };
  }, []);

  async function command(path: string, data: unknown) {
    if (!connected || !sessionRef.current) { setError('Wait for the live connection before sending a command.'); return false; }
    setError(''); setFeedback('');
    try {
      const send = (current: Session) => fetch('/api/' + path, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Session-Token': current.token },
        body: JSON.stringify(data), signal: AbortSignal.timeout(timeoutMs),
      });
      let response = await send(sessionRef.current);
      // A 401 is rejected by the API before mutation. Renew and retry it once.
      // Never automatically replay timeouts/network failures: outcome is unknown.
      if (response.status === 401) response = await send(await renewSession());
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
      setError('');
      if (typeof result.message === 'string') setFeedback(result.message);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Command failed';
      setError(error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)
        ? 'Request timed out. Check the live state before trying again; it may have been applied.' : message);
      return false;
    }
  }
  return { state, connected, session, error, feedback, setError, command };
}
