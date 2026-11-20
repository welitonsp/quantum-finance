/**
 * Usuário autenticado como o app o enxerga, independente do provedor
 * (Firebase hoje, Supabase na migração). Só o que a UI e os hooks usam:
 * nada de tokens nem do objeto bruto do SDK.
 */
export interface AppUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

interface FirebaseLikeUser {
  uid: string;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
}

interface SupabaseLikeUser {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export function appUserFromFirebase(user: FirebaseLikeUser): AppUser {
  return {
    uid: user.uid,
    displayName: str(user.displayName),
    email: str(user.email),
    photoURL: str(user.photoURL),
  };
}

/** Google via Supabase grava nome/foto em user_metadata (full_name/name, avatar_url/picture). */
export function appUserFromSupabase(user: SupabaseLikeUser): AppUser {
  const meta = user.user_metadata ?? {};
  return {
    uid: user.id,
    displayName: str(meta.full_name) ?? str(meta.name),
    email: str(user.email),
    photoURL: str(meta.avatar_url) ?? str(meta.picture),
  };
}
