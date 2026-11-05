// Protocolo WebSocket entre el cliente y el Durable Object de cada competencia.
import type { CompetitionStatus, Participant } from './types';

/** Mensajes cliente -> servidor. `reqId` correlaciona la respuesta. */
export type ClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'answer'; reqId: string; crypticId: string; guess: string }
  | { type: 'hint'; reqId: string; crypticId: string; reveal: boolean }
  | { type: 'ping' };

export interface RoomSnapshot {
  status: CompetitionStatus;
  startedAt: number | null;
  endsAt: number | null;
  participants: Participant[];
  serverTime: number; // Permite corregir el desfase del reloj del cliente.
}

export interface AnswerReply {
  correct: boolean;
  points: number;
  finished: boolean;
  explanation?: string | null;
}

export interface HintReply {
  hints: string[];
  remaining: number;
}

/** Mensajes servidor -> cliente. */
export type ServerMessage =
  | { type: 'ready'; uid: string; snapshot: RoomSnapshot }
  | { type: 'participant'; participant: Participant }
  | { type: 'finished'; winnerId: string | null }
  | { type: 'reply'; reqId: string; ok: true; data: AnswerReply | HintReply }
  | { type: 'reply'; reqId: string; ok: false; error: { code: string; message: string } }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong'; serverTime: number };

export const MAX_CLIENT_MESSAGE_BYTES = 2048;
