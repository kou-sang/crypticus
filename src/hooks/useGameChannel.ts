// Estado en vivo de una competencia servido por el Durable Object vía WebSocket.
import { useEffect, useMemo, useState } from 'react';
import { GameChannel, type ConnectionState } from '../lib/gameChannel';
import { ApiError } from '../lib/api';
import type { LiveState } from '../../shared/engine';
import type { AckReply, AnswerReply, HintReply, Solution } from '../../shared/protocol';
import type { Difficulty } from '../../shared/types';

/** Acciones de juego expuestas a la UI. */
export interface GameActions {
  answer: (crypticId: string, guess: string) => Promise<AnswerReply>;
  hint: (crypticId: string, reveal: boolean) => Promise<HintReply>;
  vote: (tier: Difficulty) => Promise<AckReply>;
  extraTime: () => Promise<AckReply>;
  skip: () => Promise<AckReply>;
  endVote: () => Promise<AckReply>;
  pass: () => Promise<AckReply>;
  surrender: () => Promise<AckReply>;
}

export interface GameChannelState {
  state: LiveState | null;
  connection: ConnectionState;
  clockOffsetMs: number; // Hora del servidor - Date.now(), estimada con la muestra de menor RTT
  rttMs: number | null; // Latencia ida y vuelta más reciente (se muestra en la barra de juego)
  solutions: Solution[]; // Rondas cerradas (y todo, al terminar)
  actions: GameActions;
}

const offline = () => Promise.reject(new ApiError('offline', 'Conectando con la sala…', 0));

export function useGameChannel(competitionId: string, enabled: boolean): GameChannelState {
  const [channel, setChannel] = useState<GameChannel | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [state, setState] = useState<LiveState | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [rttMs, setRttMs] = useState<number | null>(null);
  const [solutions, setSolutions] = useState<Solution[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let bestRtt = Infinity;
    const instance = new GameChannel(competitionId, {
      onReady: (next, revealed, serverTime) => {
        setState(next);
        setSolutions(revealed);
        setClockOffsetMs(serverTime - Date.now());
      },
      onState: (next, revealed) => {
        setState(next);
        // Evita re-render si no cambió nada revelado (lo habitual durante una ronda).
        setSolutions((prev) => (prev.length === revealed.length ? prev : revealed));
      },
      onConnection: setConnection,
      onLatency: ({ rttMs: rtt, offsetMs }) => {
        setRttMs(Math.round(rtt));
        // La muestra con menor RTT tiene la menor incertidumbre de desfase.
        if (rtt <= bestRtt) {
          bestRtt = rtt;
          setClockOffsetMs(offsetMs);
        }
      },
    });
    instance.connect();
    setChannel(instance);
    return () => {
      instance.dispose();
      setChannel(null);
    };
  }, [competitionId, enabled]);

  const actions = useMemo<GameActions>(
    () =>
      channel
        ? {
            answer: (id, guess) => channel.answer(id, guess),
            hint: (id, reveal) => channel.hint(id, reveal),
            vote: (tier) => channel.vote(tier),
            extraTime: () => channel.extraTime(),
            skip: () => channel.skip(),
            endVote: () => channel.endVote(),
            pass: () => channel.pass(),
            surrender: () => channel.surrender(),
          }
        : { answer: offline, hint: offline, vote: offline, extraTime: offline, skip: offline, endVote: offline, pass: offline, surrender: offline },
    [channel],
  );

  return { state, connection, clockOffsetMs, rttMs, solutions, actions };
}
