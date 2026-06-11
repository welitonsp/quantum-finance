import { useState, useEffect, useRef, useCallback } from 'react';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { db } from '../shared/api/firebase/index';
import { getQueue } from '../lib/offlineQueue';

const FIRESTORE_PING_INTERVAL_MS = 30_000;
const SYNC_EVENT = 'qf:sync-pending';

export interface ConnectionStatus {
  isOnline: boolean;
  isFirestoreReachable: boolean;
  pendingCount: number;
}

/**
 * Dispatches a custom event so callers can react to sync-pending moments
 * without coupling to this hook directly.
 */
function dispatchSyncEvent(): void {
  window.dispatchEvent(new CustomEvent(SYNC_EVENT));
}

/**
 * Pings Firestore with a lightweight read to detect connectivity.
 * Returns true if reachable, false otherwise.
 */
async function pingFirestore(): Promise<boolean> {
  try {
    // Minimal read: limit(1) on a known public-schema collection prefix
    // We query the root 'users' collection — even an empty result confirms connectivity.
    const q = query(collection(db, '__ping__'), limit(1));
    await getDocs(q);
    return true;
  } catch (err: unknown) {
    // permission-denied means Firestore IS reachable (server rejected the read)
    const code = (err as { code?: string })?.code ?? '';
    if (code === 'permission-denied' || code === 'unimplemented') return true;
    return false;
  }
}

export function useConnectionStatus(): ConnectionStatus {
  const [isOnline,            setIsOnline]            = useState(() => navigator.onLine);
  const [isFirestoreReachable, setIsFirestoreReachable] = useState(true);
  const [pendingCount,        setPendingCount]        = useState(() => getQueue().length);

  const wasOnlineRef = useRef(navigator.onLine);

  const refreshPendingCount = useCallback(() => {
    setPendingCount(getQueue().length);
  }, []);

  // Sync pendingCount whenever the queue might have changed
  useEffect(() => {
    // Poll every 5s to catch changes from other modules
    const timer = setInterval(refreshPendingCount, 5_000);
    return () => clearInterval(timer);
  }, [refreshPendingCount]);

  // Listen for storage changes (queue modified by other tabs)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'qf_pending_ops') refreshPendingCount();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refreshPendingCount]);

  // Handle online/offline browser events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (!wasOnlineRef.current) {
        dispatchSyncEvent();
      }
      wasOnlineRef.current = true;
      // Optimistically mark Firestore reachable; ping will confirm
      setIsFirestoreReachable(true);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setIsFirestoreReachable(false);
      wasOnlineRef.current = false;
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Firestore ping every 30s
  useEffect(() => {
    const check = async () => {
      if (!navigator.onLine) {
        setIsFirestoreReachable(false);
        return;
      }
      const reachable = await pingFirestore();
      setIsFirestoreReachable(reachable);
      if (reachable && !wasOnlineRef.current) {
        dispatchSyncEvent();
        wasOnlineRef.current = true;
      }
    };

    void check();
    const timer = setInterval(() => { void check(); }, FIRESTORE_PING_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return { isOnline, isFirestoreReachable, pendingCount };
}
