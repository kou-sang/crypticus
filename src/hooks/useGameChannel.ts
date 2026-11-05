// Estado en vivo de una competencia servido por el Durable Object vía WebSocket.
import { useEffect, useMemo, useState } from 'react';
import { GameChannel, type ConnectionState } from '../lib/gameChannel';
import type { Participant } from '../../shared/types';

export interface GameChannelState {
  channel: GameChannel | null;
  connection: ConnectionState;
  participants: Participant[];
  finished: boolean;
  clockOffsetMs: number; // serverTime - Date.now() al conectar
}

export function useGameChannel(competitionId: string, enabled: boolean): GameChannelState {
  const [channel, setChannel] = useState<GameChannel | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [participants, setParticipants] = useState<Map<string, Participant>>(new Map());
  const [finished, setFinished] = useState(false);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const instance = new GameChannel(competitionId, {
      onReady: (snapshot) => {
        setParticipants(new Map(snapshot.participants.map((p) => [p.uid, p])));
        setFinished(snapshot.status === 'finished');
        setClockOffsetMs(snapshot.serverTime - Date.now());
      },
      onParticipant: (participant) =>
        setParticipants((prev) => new Map(prev).set(participant.uid, participant)),
      onFinished: () => setFinished(true),
      onConnection: setConnection,
    });
    instance.connect();
    setChannel(instance);
    return () => {
      instance.dispose();
      setChannel(null);
    };
  }, [competitionId, enabled]);

  const list = useMemo(() => [...participants.values()], [participants]);
  return { channel, connection, participants: list, finished, clockOffsetMs };
}
