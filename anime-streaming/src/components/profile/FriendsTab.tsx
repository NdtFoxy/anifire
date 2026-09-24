"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, ShieldOff, UserMinus, UserPlus, X } from "lucide-react";
import {
  answerFriendRequest,
  blockUser,
  fetchFriends,
  removeFriend,
  requestFriend,
  type Friend,
  type FriendOverview,
} from "@/lib/library";
import { mediaUrl } from "@/lib/auth-client";
import RemoteImage from "@/components/system/RemoteImage";
import { EmptyState, ErrorState, Skeleton } from "./states";
import styles from "@/app/profile/profile.module.css";

/**
 * Friends, incoming and outgoing requests.
 *
 * Requests are addressed by email because there is deliberately no user-search
 * endpoint — a browsable directory of accounts is the cheapest possible way to
 * leak the whole user table. Failures are shown verbatim from the server, which
 * answers "no such address" and "cannot add" identically on purpose.
 */
export default function FriendsTab() {
  const [data, setData] = useState<FriendOverview | null>(null);
  const [error, setError] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // A promise chain, not async/await: the state writes must happen inside a
  // callback so the mount effect below writes nothing synchronously.
  const load = useCallback(
    () =>
      fetchFriends()
        .then((next) => {
          setData(next);
          setError(false);
        })
        .catch(() => setError(true)),
    []
  );

  useEffect(() => {
    void load();
  }, [load]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!address || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await requestFriend(address);
      setEmail("");
      setNotice("Request sent.");
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not send that request.");
    } finally {
      setBusy(false);
    }
  };

  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorState message="Could not load your friends." onRetry={load} />;
  if (!data) return <Skeleton />;

  const row = (friend: Friend, actions: React.ReactNode) => (
    <li key={friend.friendshipId} className={styles.friendRow}>
      <RemoteImage
        src={mediaUrl(friend.avatarUrl) ?? "/hero-2.png"}
        alt=""
        width={42}
        height={42}
        className={styles.friendAvatar}
      />
      <div className={styles.friendBody}>
        <span className={styles.friendName}>{friend.displayName ?? "Anifire user"}</span>
        <span className={styles.friendMeta}>Lvl {friend.level}</span>
      </div>
      <div className={styles.friendActions}>{actions}</div>
    </li>
  );

  return (
    <div className={styles.friendsWrap}>
      <form className={styles.friendForm} onSubmit={send}>
        <input
          type="email"
          className={styles.friendInput}
          placeholder="friend@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          aria-label="Friend's email"
        />
        <button className={styles.friendSend} type="submit" disabled={busy || !email.trim()}>
          {busy ? <Loader2 size={16} className={styles.spin} /> : <UserPlus size={16} />}
          Add friend
        </button>
      </form>
      {notice ? <p className={styles.friendNotice}>{notice}</p> : null}

      {data.incoming.length > 0 ? (
        <section className={styles.friendSection}>
          <h3>Requests to you</h3>
          <ul className={styles.friendList}>
            {data.incoming.map((friend) =>
              row(
                friend,
                <>
                  <button
                    type="button"
                    className={styles.friendAccept}
                    disabled={busy}
                    onClick={() => act(() => answerFriendRequest(friend.friendshipId, true))}
                    aria-label={`Accept ${friend.displayName ?? "request"}`}
                  >
                    <Check size={16} />
                  </button>
                  <button
                    type="button"
                    className={styles.friendGhost}
                    disabled={busy}
                    onClick={() => act(() => answerFriendRequest(friend.friendshipId, false))}
                    aria-label={`Decline ${friend.displayName ?? "request"}`}
                  >
                    <X size={16} />
                  </button>
                </>
              )
            )}
          </ul>
        </section>
      ) : null}

      {data.outgoing.length > 0 ? (
        <section className={styles.friendSection}>
          <h3>Waiting for an answer</h3>
          <ul className={styles.friendList}>
            {data.outgoing.map((friend) =>
              row(friend, <span className={styles.friendPending}>Pending</span>)
            )}
          </ul>
        </section>
      ) : null}

      <section className={styles.friendSection}>
        <h3>Friends {data.friends.length > 0 ? `· ${data.friends.length}` : ""}</h3>
        {data.friends.length === 0 ? (
          <EmptyState icon={<UserPlus size={22} />} title="No friends yet">
            Add someone by the email they signed up with — they will see the request here.
          </EmptyState>
        ) : (
          <ul className={styles.friendList}>
            {data.friends.map((friend) =>
              row(
                friend,
                <>
                  <button
                    type="button"
                    className={styles.friendGhost}
                    disabled={busy || friend.userId === null}
                    onClick={() => act(() => removeFriend(friend.userId!))}
                    aria-label={`Remove ${friend.displayName ?? "friend"}`}
                  >
                    <UserMinus size={16} />
                  </button>
                  <button
                    type="button"
                    className={styles.friendGhost}
                    disabled={busy || friend.userId === null}
                    onClick={() => act(() => blockUser(friend.userId!))}
                    aria-label={`Block ${friend.displayName ?? "friend"}`}
                  >
                    <ShieldOff size={16} />
                  </button>
                </>
              )
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
