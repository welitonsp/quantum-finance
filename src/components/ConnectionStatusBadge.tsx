import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Wifi, WifiOff, CheckCircle2 } from 'lucide-react';
import { useConnectionStatus } from '../hooks/useConnectionStatus';

type BadgeVariant = 'offline-with-pending' | 'offline-no-pending' | 'just-synced' | 'hidden';

const SYNCED_DISPLAY_MS = 3_000;

export function ConnectionStatusBadge() {
  const { isOnline, isFirestoreReachable, pendingCount } = useConnectionStatus();
  const [variant, setVariant] = useState<BadgeVariant>('hidden');
  const [syncTimer, setSyncTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const fullyOnline = isOnline && isFirestoreReachable;

  useEffect(() => {
    if (fullyOnline) {
      // Came back online — show "Sincronizado" briefly if we were previously showing offline
      if (variant === 'offline-with-pending' || variant === 'offline-no-pending') {
        setVariant('just-synced');
        if (syncTimer) clearTimeout(syncTimer);
        const t = setTimeout(() => setVariant('hidden'), SYNCED_DISPLAY_MS);
        setSyncTimer(t);
      }
    } else {
      // Offline
      if (syncTimer) {
        clearTimeout(syncTimer);
        setSyncTimer(null);
      }
      setVariant(pendingCount > 0 ? 'offline-with-pending' : 'offline-no-pending');
    }

    return () => {
      // No-op — timer cleaned up above
    };
  }, [fullyOnline, pendingCount, variant, syncTimer]);

  // Also update pending count display while offline
  useEffect(() => {
    if (!fullyOnline && variant !== 'hidden' && variant !== 'just-synced') {
      setVariant(pendingCount > 0 ? 'offline-with-pending' : 'offline-no-pending');
    }
  }, [pendingCount, fullyOnline, variant]);

  const badgeContent = (): { icon: React.ReactNode; label: string; className: string } | null => {
    switch (variant) {
      case 'offline-with-pending':
        return {
          icon: <WifiOff className="w-3.5 h-3.5 shrink-0" />,
          label: `Sem conexão — ${pendingCount} ${pendingCount === 1 ? 'operação pendente' : 'operações pendentes'}`,
          className: 'bg-amber-500/90 text-white border-amber-400/50',
        };
      case 'offline-no-pending':
        return {
          icon: <WifiOff className="w-3.5 h-3.5 shrink-0" />,
          label: 'Sem conexão',
          className: 'bg-amber-500/90 text-white border-amber-400/50',
        };
      case 'just-synced':
        return {
          icon: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />,
          label: 'Sincronizado',
          className: 'bg-emerald-500/90 text-white border-emerald-400/50',
        };
      default:
        return null;
    }
  };

  const content = badgeContent();

  return (
    <AnimatePresence>
      {content && variant !== 'hidden' && (
        <motion.div
          key={variant}
          initial={{ opacity: 0, y: 16, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.95 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className={`fixed bottom-24 right-6 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border shadow-lg backdrop-blur-sm ${content.className}`}
          aria-live="polite"
          aria-atomic="true"
        >
          {content.icon}
          <span>{content.label}</span>
          {variant === 'offline-with-pending' && (
            <Wifi className="w-3 h-3 opacity-50 animate-pulse" />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
