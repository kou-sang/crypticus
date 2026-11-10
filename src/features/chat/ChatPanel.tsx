// Panel de chat reutilizable (global, directo o de competencia). Últimos 50 mensajes en vivo.
import { useEffect, useRef, useState, type FormEvent, memo } from 'react';
import { collection, limit, orderBy, query, type Timestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useLiveQuery } from '../../hooks/useFirestore';
import { useSession } from '../../hooks/useAuth';
import { sendMessage } from '../../lib/repo';
import { cx, errorMessage } from '../../lib/utils';
import { ErrorBanner } from '../../components/ui';

interface ChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: Timestamp | null; // null mientras la escritura está pendiente
}

export type ChatTarget = { kind: 'chat'; chatId: string } | { kind: 'competition'; competitionId: string };

const MESSAGE_LIMIT = 50;

/** Aviso de la partida en el chat (ronda nueva, daño…). `at`: hora del servidor en ms. */
export interface SystemLine {
  key: string;
  at: number;
  text: string;
}

type Entry = { kind: 'message'; at: number; message: ChatMessage } | { kind: 'system'; at: number; line: SystemLine };

/** Mensajes y avisos por hora. Los mensajes pendientes (sin hora del servidor) van al final. */
function mergeEntries(messages: ChatMessage[], lines: SystemLine[]): Entry[] {
  const entries: Entry[] = [
    ...messages.map((message) => ({ kind: 'message' as const, at: message.createdAt?.toMillis() ?? Number.POSITIVE_INFINITY, message })),
    ...lines.map((line) => ({ kind: 'system' as const, at: line.at, line })),
  ];
  // `sort` es estable: a igual hora se conserva el orden de cada lista.
  return entries.sort((a, b) => a.at - b.at);
}

export const ChatPanel = memo(function ChatPanel({
  target,
  className,
  compact = false,
  fill = false,
  readOnly = false,
  systemLines,
  onActivity,
}: {
  target: ChatTarget;
  className?: string;
  compact?: boolean;
  /** Ocupa toda la altura del contenedor (panel lateral). */
  fill?: boolean;
  /** Sin campo para escribir (espectadores). */
  readOnly?: boolean;
  /** Avisos de la partida intercalados por hora con los mensajes (ronda nueva, daño…). */
  systemLines?: SystemLine[];
  /** Aviso con el id del último mensaje ajeno (contador de no leídos del panel desplegable). */
  onActivity?: (lastForeignId: string | null) => void;
}) {
  const { profile } = useSession();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const key = target.kind === 'chat' ? target.chatId : target.competitionId;

  const path =
    target.kind === 'chat'
      ? collection(db, 'chats', target.chatId, 'messages')
      : collection(db, 'competitions', target.competitionId, 'messages');
  const live = useLiveQuery<ChatMessage>(query(path, orderBy('createdAt', 'desc'), limit(MESSAGE_LIMIT)), [target.kind, key]);
  const messages = [...live.data].reverse();
  const entries = mergeEntries(messages, systemLines ?? []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [entries.length]);

  const lastForeignId = live.data.find((m) => m.authorId !== profile.uid)?.id ?? null; // `data` va del más nuevo al más viejo.
  useEffect(() => {
    if (!live.loading) onActivity?.(lastForeignId);
  }, [live.loading, lastForeignId, onActivity]);

  const handleSend = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft;
    if (!text.trim()) return;
    setDraft(''); // Optimista: la caché local muestra el mensaje al instante.
    setError(null);
    try {
      await sendMessage(target, profile, text);
    } catch (err) {
      setDraft(text);
      setError(errorMessage(err));
    }
  };

  return (
    <div className={cx('flex min-h-0 flex-col border border-line', className)}>
      {/* Alto fijo con barra de desplazamiento (antes `compact` crecía desde un renglón según los mensajes). */}
      <div
        ref={scrollRef}
        className={cx('flex-1 space-y-2 overflow-y-scroll p-3 [scrollbar-gutter:stable]', fill ? 'min-h-0' : compact ? 'h-72' : 'h-[50dvh]')}
      >
        {live.error && <ErrorBanner error="No tienes acceso a este chat." />}
        {entries.length === 0 && !live.loading && <p className="py-8 text-center text-sm text-muted">Sin mensajes todavía.</p>}
        {entries.map((entry, index) => {
          if (entry.kind === 'system') {
            return (
              <p key={entry.line.key} className="fade-in text-center text-xs text-muted">
                {entry.line.text}
              </p>
            );
          }
          const message = entry.message;
          const before = entries[index - 1];
          const mine = message.authorId === profile.uid;
          // Tras un aviso de la partida se repite el nombre.
          const showName = !mine && (before?.kind !== 'message' || before.message.authorId !== message.authorId);
          return (
            <div key={message.id} className={cx('flex flex-col', mine ? 'items-end' : 'items-start')}>
              {showName && <span className="mb-0.5 text-[11px] font-semibold text-muted">{message.authorName}</span>}
              <p
                className={cx(
                  'max-w-[85%] whitespace-pre-wrap break-words px-3 py-1.5 text-sm',
                  mine ? 'bg-ink text-paper' : 'border border-line',
                  message.createdAt === null && 'opacity-60',
                )}
              >
                {message.text}
              </p>
            </div>
          );
        })}
      </div>
      {readOnly ? (
        <p className="border-t border-line px-3 py-2 text-xs text-muted">Solo los participantes escriben en este chat.</p>
      ) : (
        <form onSubmit={handleSend} className="flex border-t border-line">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
            placeholder="Escribe un mensaje…"
            aria-label="Mensaje"
            className="h-11 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
          />
          <button type="submit" className="px-4 text-sm font-semibold text-accent disabled:opacity-40" disabled={!draft.trim()}>
            Enviar
          </button>
        </form>
      )}
      {error && <ErrorBanner error={error} />}
    </div>
  );
});
