// Canal WebSocket con el Durable Object de una competencia: auth, request/response y reconexión.
import { auth } from './firebase';
import { ApiError } from './api';
import type { AckReply, ActionMessage, AnswerReply, ClientMessage, HintReply, ServerMessage, Solution } from '../../shared/protocol';
import type { LiveState } from '../../shared/engine';
import type { Difficulty } from '../../shared/types';

export type ConnectionState = 'connecting' | 'open' | 'closed';

export interface GameChannelHandlers {
  onReady: (state: LiveState | null, solutions: Solution[], serverTime: number) => void;
  onLatency?: (sample: { rttMs: number; offsetMs: number }) => void;
  onState: (state: LiveState, solutions: Solution[]) => void;
  onConnection: (state: ConnectionState) => void;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: number;
}

const REQUEST_TIMEOUT_MS = 8_000;
const PING_INTERVAL_MS = 10_000;
const INITIAL_PINGS = 3; // Ráfaga inicial: el RTT mínimo da el desfase de reloj más preciso.
const MAX_BACKOFF_MS = 8_000;

export class GameChannel {
  private socket: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private sequence = 0;
  private attempts = 0;
  private disposed = false;
  private pingTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private authenticated = false;

  constructor(
    private readonly competitionId: string,
    private readonly handlers: GameChannelHandlers,
  ) {}

  connect(): void {
    if (this.disposed) return;
    this.handlers.onConnection('connecting');
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${window.location.host}/api/competitions/${encodeURIComponent(this.competitionId)}/ws`;

    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch (error) {
      console.error('[ws] no se pudo abrir', error);
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error('Sin sesión');
        this.rawSend({ type: 'auth', token });
      } catch (error) {
        console.error('[ws] auth', error);
        socket.close(4401, 'no-token');
      }
    };

    socket.onmessage = (event) => this.handleMessage(event.data);
    socket.onclose = () => this.handleClose();
    socket.onerror = () => {
      // onclose se dispara a continuación; ahí se gestiona la reconexión.
    };
  }

  answer(crypticId: string, guess: string): Promise<AnswerReply> {
    return this.request<AnswerReply>({ type: 'answer', reqId: this.nextId(), crypticId, guess });
  }

  hint(crypticId: string, reveal: boolean): Promise<HintReply> {
    return this.request<HintReply>({ type: 'hint', reqId: this.nextId(), crypticId, reveal });
  }

  vote(tier: Difficulty): Promise<AckReply> {
    return this.request<AckReply>({ type: 'vote', reqId: this.nextId(), tier });
  }

  extraTime(): Promise<AckReply> {
    return this.request<AckReply>({ type: 'extraTime', reqId: this.nextId() });
  }

  skip(): Promise<AckReply> {
    return this.request<AckReply>({ type: 'skip', reqId: this.nextId() });
  }

  surrender(): Promise<AckReply> {
    return this.request<AckReply>({ type: 'surrender', reqId: this.nextId() });
  }

  pass(): Promise<AckReply> {
    return this.request<AckReply>({ type: 'pass', reqId: this.nextId() });
  }

  endVote(): Promise<AckReply> {
    return this.request<AckReply>({ type: 'endVote', reqId: this.nextId() });
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimers();
    this.rejectAll(new ApiError('closed', 'Conexión cerrada.', 0));
    this.socket?.close(1000, 'dispose');
    this.socket = null;
  }

  // ---------- Internos ----------

  private nextId(): string {
    this.sequence += 1;
    return `r${this.sequence}`;
  }

  private rawSend(message: ClientMessage): void {
    if (this.socket?.readyState !== WebSocket.OPEN) throw new ApiError('offline', 'Reconectando…', 0);
    this.socket.send(JSON.stringify(message));
  }

  private request<T>(message: ActionMessage): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.authenticated) {
        reject(new ApiError('offline', 'Conectando con la sala…', 0));
        return;
      }
      const timer = window.setTimeout(() => {
        this.pending.delete(message.reqId);
        reject(new ApiError('timeout', 'El servidor tardó demasiado.', 0));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(message.reqId, { resolve: resolve as (value: unknown) => void, reject, timer });
      try {
        this.rawSend(message);
      } catch (error) {
        window.clearTimeout(timer);
        this.pending.delete(message.reqId);
        reject(error as Error);
      }
    });
  }

  private handleMessage(raw: unknown): void {
    let message: ServerMessage;
    try {
      message = JSON.parse(String(raw)) as ServerMessage;
    } catch {
      console.warn('[ws] mensaje inválido');
      return;
    }

    switch (message.type) {
      case 'ready':
        this.authenticated = true;
        this.attempts = 0;
        this.handlers.onConnection('open');
        this.handlers.onReady(message.state, message.solutions ?? [], message.serverTime);
        this.startPing();
        break;
      case 'state':
        this.handlers.onState(message.state, message.solutions ?? []);
        break;
      case 'reply': {
        const pending = this.pending.get(message.reqId);
        if (!pending) return;
        window.clearTimeout(pending.timer);
        this.pending.delete(message.reqId);
        if (message.ok) pending.resolve(message.data);
        else pending.reject(new ApiError(message.error.code, message.error.message, 0));
        break;
      }
      case 'error':
        console.warn('[ws] error del servidor', message.code, message.message);
        break;
      case 'pong':
        if (typeof message.sentAt === 'number') {
          // NTP simplificado: el servidor marcó la hora a mitad del viaje.
          const now = Date.now();
          const rttMs = now - message.sentAt;
          this.handlers.onLatency?.({ rttMs, offsetMs: message.serverTime - (message.sentAt + rttMs / 2) });
        }
        break;
      case 'probe':
        try {
          this.rawSend({ type: 'probeAck', id: message.id });
        } catch {
          // Desconectado: se medirá en la próxima.
        }
        break;
    }
  }

  private handleClose(): void {
    this.authenticated = false;
    this.socket = null;
    this.clearTimers();
    this.rejectAll(new ApiError('offline', 'Se perdió la conexión.', 0));
    this.handlers.onConnection('closed');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    const delay = Math.min(MAX_BACKOFF_MS, 300 * 2 ** this.attempts);
    this.attempts += 1;
    this.reconnectTimer = window.setTimeout(() => this.connect(), delay);
  }

  private ping(): void {
    try {
      this.rawSend({ type: 'ping', sentAt: Date.now() });
    } catch {
      // Si no está abierto, onclose reconectará.
    }
  }

  private startPing(): void {
    if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
    for (let i = 0; i < INITIAL_PINGS; i++) window.setTimeout(() => this.ping(), i * 250);
    this.pingTimer = window.setInterval(() => this.ping(), PING_INTERVAL_MS);
  }

  private clearTimers(): void {
    if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.pingTimer = null;
    this.reconnectTimer = null;
  }

  private rejectAll(error: Error): void {
    this.pending.forEach((pending) => {
      window.clearTimeout(pending.timer);
      pending.reject(error);
    });
    this.pending.clear();
  }
}
