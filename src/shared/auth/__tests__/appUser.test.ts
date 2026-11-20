import { describe, expect, it } from 'vitest';
import { appUserFromFirebase, appUserFromSupabase } from '../appUser';

describe('appUserFromFirebase', () => {
  it('copia só os campos usados pela UI', () => {
    const u = appUserFromFirebase({ uid: 'u1', displayName: 'Ana', email: 'a@x.dev', photoURL: 'https://img/a.png' });
    expect(u).toEqual({ uid: 'u1', displayName: 'Ana', email: 'a@x.dev', photoURL: 'https://img/a.png' });
  });

  it('normaliza ausentes e vazios para null', () => {
    expect(appUserFromFirebase({ uid: 'u2', displayName: '  ' })).toEqual({
      uid: 'u2', displayName: null, email: null, photoURL: null,
    });
  });
});

describe('appUserFromSupabase', () => {
  it('lê nome e foto do user_metadata do Google', () => {
    const u = appUserFromSupabase({
      id: 'abc',
      email: 'b@x.dev',
      user_metadata: { full_name: 'Bia', avatar_url: 'https://img/b.png' },
    });
    expect(u).toEqual({ uid: 'abc', displayName: 'Bia', email: 'b@x.dev', photoURL: 'https://img/b.png' });
  });

  it('usa name/picture como alternativa e ignora tipos inválidos', () => {
    expect(appUserFromSupabase({ id: 'c', user_metadata: { name: 'Caio', picture: 42 } })).toEqual({
      uid: 'c', displayName: 'Caio', email: null, photoURL: null,
    });
  });

  it('aceita user_metadata ausente', () => {
    expect(appUserFromSupabase({ id: 'd', user_metadata: null }).displayName).toBeNull();
  });
});
