// Sala COOP en vivo: vista del jugador servida por el Durable Object y acciones (responder, tienda, habilidades…).
import { useCallback, useEffect, useRef, useState } from 'react';
import { GameChannel, type ConnectionState } from '../lib/gameChannel';
import { ApiError } from '../lib/api';
import type { CoopClientAction, CoopReply, CoopView } from '../../shared/coop/protocol';
import type { CoopEvent } from '../../shared/coop/events';

export interface CoopChannelState {
  view: CoopView | null;
  connection: ConnectionState;
  /** Hora del servidor − Date.now(). */
  clockOffsetMs: number;
  act: (action: CoopClientAction) => Promise<CoopReply>;
  /** Suscripción a los eventos de cada difusión (animaciones y sonidos). */
  onEvents: (listener: (events: CoopEvent[]) => void) => () => void;
}

export function useCoopChannel(competitionId: string, enabled: boolean): CoopChannelState {
  const [view, setView] = useState<CoopView | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const channel = useRef<GameChannel | null>(null);
  const listeners = useRef(new Set<(events: CoopEvent[]) => void>());

  useEffect(() => {
    if (!enabled) return;
    let bestRtt = Infinity;
    const instance = new GameChannel(competitionId, {
      onReady: () => undefined, // Las salas COOP no envían `ready`.
      onState: () => undefined,
      onCoop: (next) => {
        setView(next);
        if (bestRtt === Infinity) setClockOffsetMs(next.serverTime - Date.now());
        if (next.events.length > 0) for (const listener of listeners.current) listener(next.events);
      },
      onConnection: setConnection,
      onLatency: ({ rttMs, offsetMs }) => {
        if (rttMs <= bestRtt) {
          bestRtt = rttMs;
          setClockOffsetMs(offsetMs);
        }
      },
    });
    instance.connect();
    channel.current = instance;
    return () => {
      instance.dispose();
      channel.current = null;
    };
  }, [competitionId, enabled]);

  const act = useCallback(
    (action: CoopClientAction) =>
      channel.current ? channel.current.coop(action) : Promise.reject(new ApiError('offline', 'Conectando con la sala…', 0)),
    [],
  );
  const onEvents = useCallback((listener: (events: CoopEvent[]) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  return { view, connection, clockOffsetMs, act, onEvents };
}
