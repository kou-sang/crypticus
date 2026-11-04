// Panel de chat reutilizable (global, directo o de competencia). Últimos 50 mensajes en vivo.
import { useEffect, useRef, useState, type FormEvent } from 'react';
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

export function ChatPanel({ target, className, compact = false }: { target: ChatTarget; className?: string; compact?: boolean }) {
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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

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
      <div ref={scrollRef} className={cx('flex-1 space-y-2 overflow-y-auto p-3', compact ? 'max-h-72' : 'min-h-[50dvh]')}>
        {live.error && <ErrorBanner error="No tienes acceso a este chat." />}
        {messages.length === 0 && !live.loading && <p className="py-8 text-center text-sm text-muted">Sin mensajes todavía.</p>}
        {messages.map((message, index) => {
          const mine = message.authorId === profile.uid;
          const showName = !mine && messages[index - 1]?.authorId !== message.authorId;
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
      {error && <ErrorBanner error={error} />}
    </div>
  );
}
