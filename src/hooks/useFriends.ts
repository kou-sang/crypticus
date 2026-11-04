// Relaciones de amistad del usuario, derivadas de una sola suscripción.
import { useMemo } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useLiveQuery } from './useFirestore';

export interface FriendRequest {
  id: string;
  from: string;
  to: string;
  members: string[];
  status: 'pending' | 'accepted';
  createdAt: number;
}

export function useFriends(uid: string | undefined) {
  const live = useLiveQuery<FriendRequest>(
    uid ? query(collection(db, 'friendRequests'), where('members', 'array-contains', uid)) : null,
    [uid],
  );

  return useMemo(() => {
    const accepted = live.data.filter((r) => r.status === 'accepted');
    return {
      loading: live.loading,
      error: live.error,
      all: live.data,
      friends: accepted,
      friendIds: accepted.map((r) => (r.from === uid ? r.to : r.from)),
      incoming: live.data.filter((r) => r.status === 'pending' && r.to === uid),
      outgoing: live.data.filter((r) => r.status === 'pending' && r.from === uid),
    };
  }, [live, uid]);
}
