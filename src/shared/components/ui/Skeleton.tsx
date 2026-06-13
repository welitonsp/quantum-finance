interface Props {
  className?: string;
  rows?: number;
}

function SkeletonRow({ className = '' }: { className?: string }) {
  return (
    <div className={`h-4 bg-quantum-card/60 rounded-lg animate-pulse ${className}`} />
  );
}

export function Skeleton({ className = '', rows = 1 }: Props) {
  if (rows === 1) return <SkeletonRow className={className} />;
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} className={i === rows - 1 ? 'w-2/3' : 'w-full'} />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`p-4 rounded-2xl bg-quantum-card/50 border border-quantum-border space-y-3 ${className}`}>
      <div className="h-4 bg-quantum-card/60 rounded-lg animate-pulse w-1/3" />
      <div className="h-8 bg-quantum-card/60 rounded-lg animate-pulse w-2/3" />
      <div className="h-3 bg-quantum-card/60 rounded-lg animate-pulse w-1/2" />
    </div>
  );
}
