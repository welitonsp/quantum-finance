import { useState, useCallback } from 'react';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, app } from '../api/firebase/index';

export interface PushNotificationState {
  permission: NotificationPermission;
  token: string | null;
  loading: boolean;
  error: string | null;
}

export function usePushNotifications(uid: string | null) {
  const [permission, setPermission] = useState<NotificationPermission>(
    () => (typeof Notification !== 'undefined' ? Notification.permission : 'default'),
  );
  const [token,   setToken]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const vapidKey   = import.meta.env.VITE_FCM_VAPID_KEY as string | undefined;
  const isEmulator = import.meta.env.VITE_USE_EMULATOR === 'true';

  const isSupported =
    typeof Notification !== 'undefined' &&
    'serviceWorker' in navigator &&
    !isEmulator &&
    !!vapidKey;

  const requestPermission = useCallback(async () => {
    if (!uid || !isSupported) return;
    setLoading(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return;

      const { getMessaging, getToken: getFCMToken, isSupported: fcmIsSupported } =
        await import('firebase/messaging');
      if (!(await fcmIsSupported())) {
        setError('Notificações não suportadas neste navegador.');
        return;
      }

      const messaging = getMessaging(app);
      const swReg     = await navigator.serviceWorker.ready;
      const fcmToken  = await getFCMToken(messaging, {
        vapidKey:                vapidKey!,
        serviceWorkerRegistration: swReg,
      });

      await setDoc(doc(db, `users/${uid}/fcmTokens/${fcmToken}`), {
        token:     fcmToken,
        platform:  'web',
        createdAt: serverTimestamp(),
      });

      setToken(fcmToken);
    } catch {
      setError('Não foi possível ativar as notificações.');
    } finally {
      setLoading(false);
    }
  }, [uid, isSupported, vapidKey]);

  const revokePermission = useCallback(async () => {
    if (!uid || !token) return;
    try {
      await deleteDoc(doc(db, `users/${uid}/fcmTokens/${token}`));
      setToken(null);
    } catch {
      // best-effort cleanup — token will expire server-side
    }
  }, [uid, token]);

  return {
    permission,
    token,
    loading,
    error,
    isSupported,
    requestPermission,
    revokePermission,
  };
}
