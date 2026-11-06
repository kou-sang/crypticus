// Estado en vivo de una competencia servido por el Durable Object vía WebSocket.
import { useEffect, useMemo, useState } from 'react';
import { GameChannel, type ConnectionState } from '../lib/gameChannel';
import { ApiError } from '../lib/api';
import type { LiveState } from '../../shared/engine';
import type { AckReply, AnswerReply, HintReply } from '../../shared/protocol';
import type { Difficulty } from '../../shared/types';

/** Acciones de juego expuestas a la UI. */
export interface GameActions {
  answer: (crypticId: string, guess: string) => Promise<AnswerReply>;
  hint: (crypticId: string, reveal: boolean) => Promise<HintReply>;
  vote: (tier: Difficulty) => Promise<AckReply>;
  extraTime: () => Promise<AckReply>;
  skip: () => Promise<AckReply>;
}

export interface GameChannelState {
  state: LiveState | null;
  connection: ConnectionState;
  clockOffsetMs: number; // serverTime - Date.now() al conectar
  actions: GameActions;
}

const offline = () => Promise.reject(new ApiError('offline', 'Conectando con la sala…', 0));

export function useGameChannel(competitionId: string, enabled: boolean): GameChannelState {
  const [channel, setChannel] = useState<GameChannel | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [state, setState] = useState<LiveState | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const instance = new GameChannel(competitionId, {
      onReady: (next, serverTime) => {
        setState(next);
        setClockOffsetMs(serverTime - Date.now());
      },
      onState: setState,
      onConnection: setConnection,
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
          }
        : { answer: offline, hint: offline, vote: offline, extraTime: offline, skip: offline },
    [channel],
  );

  return { state, connection, clockOffsetMs, actions };
}
