// Chat: sala global + conversaciones directas con amigos.
import { NavLink, useParams } from 'react-router';
import { useSession } from '../../hooks/useAuth';
import { useFriends } from '../../hooks/useFriends';
import { useUsers } from '../../hooks/useUsers';
import { cx, pairId } from '../../lib/utils';
import { Avatar, EmptyState, PageHeader } from '../../components/ui';
import { ChatPanel } from './ChatPanel';

export default function ChatPage() {
  const { profile } = useSession();
  const { chatId = 'global' } = useParams();
  const { friendIds, loading } = useFriends(profile.uid);
  const users = useUsers(friendIds);

  const isAllowed = chatId === 'global' || loading || friendIds.some((id) => pairId(profile.uid, id) === chatId);
  const title =
    chatId === 'global'
      ? 'Sala global'
      : users.get(chatId.split('_').find((id) => id !== profile.uid) ?? '')?.displayName ?? 'Conversación';

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cx('flex items-center gap-3 px-3 py-2 text-sm', isActive ? 'bg-ink text-paper' : 'hover:bg-paper-2');

  return (
    <>
      <PageHeader kicker="Chat" title={title} />
      <div className="grid gap-6 md:grid-cols-[240px_1fr]">
        <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          <NavLink to="/chat" end className={linkClass}>
            <span className="font-mono">#</span> Global
          </NavLink>
          {friendIds.map((friendId) => {
            const friend = users.get(friendId);
            return (
              <NavLink key={friendId} to={`/chat/${pairId(profile.uid, friendId)}`} className={linkClass}>
                <Avatar name={friend?.displayName ?? '?'} size="sm" />
                <span className="truncate">{friend?.displayName ?? '…'}</span>
              </NavLink>
            );
          })}
        </nav>
        {isAllowed ? (
          <ChatPanel key={chatId} target={{ kind: 'chat', chatId }} />
        ) : (
          <EmptyState title="Solo puedes chatear con tus amigos" />
        )}
      </div>
    </>
  );
}
