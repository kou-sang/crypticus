// Protocolo WebSocket entre el cliente y el Durable Object de cada competencia.
import type { LiveState } from './engine';
import type { Difficulty } from './types';

/** Mensajes cliente -> servidor. `reqId` correlaciona la respuesta. */
export type ClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'answer'; reqId: string; crypticId: string; guess: string }
  | { type: 'hint'; reqId: string; crypticId: string; reveal: boolean }
  | { type: 'vote'; reqId: string; tier: Difficulty }
  | { type: 'extraTime'; reqId: string }
  | { type: 'skip'; reqId: string }
  | { type: 'endVote'; reqId: string }
  | { type: 'ping'; sentAt?: number } // Eco en pong: el cliente mide RTT y desfase de reloj.
  | { type: 'probeAck'; id: number }; // Respuesta a `probe`: el servidor mide el RTT de este jugador.

export type ActionMessage = Extract<ClientMessage, { reqId: string }>;

export interface AnswerReply {
  correct: boolean;
  points: number; // Puntos o daño al jefe
  finished: boolean;
  stale: boolean; // Correcta, pero otro ganó la ronda primero
  explanation?: string | null;
}

export interface HintReply {
  hints: string[];
  remaining: number;
}

export interface AckReply {
  ok: true;
  applied?: boolean;
}

/** Solución de un criptico, revelada solo cuando ya no se puede responder (ver `revealableIds`). */
export interface Solution {
  crypticId: string;
  answer: string | null;
  explanation: string | null;
  solvedBy: string[];
}

/** Mensajes servidor -> cliente. El estado completo se difunde tras cada cambio (es pequeño). */
export type ServerMessage =
  | { type: 'ready'; uid: string; state: LiveState | null; solutions: Solution[]; serverTime: number }
  | { type: 'state'; state: LiveState; solutions: Solution[] }
  | { type: 'reply'; reqId: string; ok: true; data: AnswerReply | HintReply | AckReply }
  | { type: 'reply'; reqId: string; ok: false; error: { code: string; message: string } }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong'; serverTime: number; sentAt?: number }
  | { type: 'probe'; id: number };

export const MAX_CLIENT_MESSAGE_BYTES = 2048;
