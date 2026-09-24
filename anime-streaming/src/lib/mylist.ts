"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  addBookmark,
  fetchBookmarks,
  mergeBookmarks,
  removeBookmark,
  type Bookmark,
} from "@/lib/library";

/**
 * Client-side "My List" + likes, persisted to localStorage. No backend table
 * exists for these yet, so we keep them on the device and broadcast changes via
 * a custom event so every card / the navbar stay in sync.
 */
const LIST_KEY = "anifire.mylist.v1";
const LIKES_KEY = "anifire.likes.v1";
const EVENT = "anifire:lists";
/** Marks that this device already handed its local list to the account. */
const MERGED_KEY = "anifire.mylist.merged";

function read(key: string): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}

function write(key: string, ids: number[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* storage disabled — non-fatal */
  }
}

function toggle(key: string, id: number): void {
  const ids = read(key);
  write(key, ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
}

/**
 * One in-flight bookmark load per account, shared by every hook instance.
 *
 * Why: a StrictMode remount (and any fast unmount/remount, such as a route
 * transition) tore the first mount down before GET /me/bookmarks resolved. The
 * `syncedFor` ref survives that remount but the in-flight load did not, so the
 * second mount saw "already synced for this user", skipped the fetch, and My
 * List rendered empty even though the request had returned the account's rows.
 * Sharing the promise lets the surviving mount pick that result up, and keeps
 * the one-time local→server merge to a single POST.
 */
const pendingLists = new Map<number, Promise<number[]>>();

async function loadServerList(userId: number): Promise<number[]> {
  const mergedKey = `${MERGED_KEY}.${userId}`;
  const local = read(LIST_KEY);
  let remote: Bookmark[];
  if (local.length > 0 && !window.localStorage.getItem(mergedKey)) {
    remote = await mergeBookmarks(local);
    try {
      window.localStorage.setItem(mergedKey, String(Date.now()));
      window.localStorage.removeItem(LIST_KEY);
    } catch {
      /* storage disabled — the merge already happened server-side */
    }
  } else {
    remote = await fetchBookmarks();
  }
  return remote.map((b) => b.animeId);
}

/**
 * "My List" and likes.
 *
 * The list is server-owned once you are signed in, so it follows the account to
 * a phone or a TV; likes stay device-local (there is no likes table yet, and
 * inventing one silently would be worse than saying so). A signed-in device with
 * a leftover local list uploads it once and then defers to the server — the
 * merge is keyed in localStorage so it cannot run twice and resurrect titles the
 * user removed elsewhere.
 */
export function useMyList() {
  const [list, setList] = useState<number[]>([]);
  const [likes, setLikes] = useState<number[]>([]);
  const { user } = useAuth();
  const syncedFor = useRef<number | null>(null);

  useEffect(() => {
    const sync = () => {
      setLikes(read(LIKES_KEY));
      if (!user) setList(read(LIST_KEY));
    };
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [user]);

  // Adopt the device list once per account, then read from the server. The
  // account counts as synced only once its rows are actually in state — marking
  // it when the request *starts* is what left the list empty after a remount.
  useEffect(() => {
    if (!user) return;
    const uid = user.id;
    if (syncedFor.current === uid) return;

    let cancelled = false;
    let job = pendingLists.get(uid);
    if (!job) {
      job = loadServerList(uid).finally(() => pendingLists.delete(uid));
      pendingLists.set(uid, job);
    }
    void job.then(
      (ids) => {
        if (cancelled) return;
        syncedFor.current = uid;
        setList(ids);
      },
      () => {
        /* offline or backend down — keep the screen as-is and retry next mount */
      }
    );

    return () => {
      cancelled = true;
    };
  }, [user]);

  const toggleList = useCallback(
    (id: number) => {
      if (!user) {
        toggle(LIST_KEY, id);
        return;
      }
      // Optimistic: the grid must not wait for a round trip, and a failed call
      // rolls the item back rather than lying about what was saved.
      const had = list.includes(id);
      setList((cur) => (had ? cur.filter((x) => x !== id) : [...cur, id]));
      const call = had ? removeBookmark(id) : addBookmark(id);
      void call
        .then((ok) => {
          if (!ok) setList((cur) => (had ? [...cur, id] : cur.filter((x) => x !== id)));
        })
        .catch(() => {
          setList((cur) => (had ? [...cur, id] : cur.filter((x) => x !== id)));
        });
    },
    [list, user]
  );

  const toggleLike = useCallback((id: number) => toggle(LIKES_KEY, id), []);

  return {
    list,
    likes,
    inList: useCallback((id: number) => list.includes(id), [list]),
    isLiked: useCallback((id: number) => likes.includes(id), [likes]),
    toggleList,
    toggleLike,
  };
}
