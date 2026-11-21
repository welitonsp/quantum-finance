-- Testes de grupos: leitura só por membros, convite de uso único pelo e-mail,
-- cotas íntegras e quitação restrita. Rodar: psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_grupos.sql
\set QUIET on
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),  -- dono
  ('00000000-0000-0000-0000-0000000000a2'),  -- convidado
  ('00000000-0000-0000-0000-0000000000a3');  -- estranho

create function pg_temp.login(uid text, email text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'email', email)::text, true);
$$;
grant execute on function pg_temp.login(text, text) to authenticated;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;

set local role authenticated;

-- dono cria o grupo pela função e vira membro; INSERT direto é recusado
select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'Dono@Exemplo.com') \g /dev/null
insert into ids select 'g', public.create_group('  Casa  ', 'Contas da casa', 'Dono');
do $$ begin
  if (select name from public.groups) <> 'Casa' then raise exception 'FALHA: nome não aparado'; end if;
  if (select count(*) from public.group_members) <> 1
     or (select email from public.group_members) <> 'dono@exemplo.com' then
    raise exception 'FALHA: dono não virou membro';
  end if;
  begin
    insert into public.groups (owner_id, name) values (auth.uid(), 'Direto');
    raise exception 'FALHA: INSERT direto em groups';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.group_members (group_id, user_id, display_name)
    values ((select v from ids where k = 'g'), '00000000-0000-0000-0000-0000000000a3', 'Intruso');
    raise exception 'FALHA: INSERT direto em group_members';
  exception when insufficient_privilege then null;
  end;
end $$;

-- convite: só o dono, e-mail normalizado, repetido devolve o mesmo
insert into ids select 'i', public.create_group_invite((select v from ids where k = 'g'), ' Convidado@Exemplo.com ', 'Dono');
do $$ begin
  if public.create_group_invite((select v from ids where k = 'g'), 'convidado@exemplo.com', 'Dono')
     <> (select v from ids where k = 'i') then
    raise exception 'FALHA: convite pendente duplicado';
  end if;
  if (select invitee_email from public.group_invites) <> 'convidado@exemplo.com' then
    raise exception 'FALHA: e-mail do convite não normalizado';
  end if;
  begin
    perform public.create_group_invite((select v from ids where k = 'g'), 'sem-arroba', 'Dono');
    raise exception 'FALHA: e-mail inválido aceito';
  exception when sqlstate '22023' then null;
  end;
end $$;

-- estranho não vê nada, não convida, não aceita convite de outro e-mail
select pg_temp.login('00000000-0000-0000-0000-0000000000a3', 'estranho@exemplo.com') \g /dev/null
do $$ begin
  if exists (select 1 from public.groups) or exists (select 1 from public.group_members)
     or exists (select 1 from public.group_invites) then
    raise exception 'FALHA: estranho vê dados do grupo';
  end if;
  begin
    perform public.create_group_invite((select v from ids where k = 'g'), 'x@exemplo.com', 'X');
    raise exception 'FALHA: não dono convidou';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.accept_group_invite((select v from ids where k = 'g'), (select v from ids where k = 'i'), 'Estranho');
    raise exception 'FALHA: aceite com e-mail errado';
  exception when insufficient_privilege then null;
  end;
end $$;

-- convidado vê o convite pelo e-mail, aceita uma vez só
select pg_temp.login('00000000-0000-0000-0000-0000000000a2', 'convidado@exemplo.com') \g /dev/null
do $$ begin
  if (select count(*) from public.group_invites where status = 'pending') <> 1 then
    raise exception 'FALHA: convidado não vê o convite';
  end if;
  if exists (select 1 from public.groups) then raise exception 'FALHA: convidado vê grupo antes de aceitar'; end if;
  perform public.accept_group_invite((select v from ids where k = 'g'), (select v from ids where k = 'i'), 'Convidado');
  if (select count(*) from public.group_members) <> 2 then raise exception 'FALHA: aceite não adicionou membro'; end if;
  begin
    perform public.accept_group_invite((select v from ids where k = 'g'), (select v from ids where k = 'i'), 'De novo');
    raise exception 'FALHA: convite aceito duas vezes';
  exception when sqlstate '22023' then null;
  end;
  begin
    update public.groups set name = 'Tomado';
    if (select name from public.groups) = 'Tomado' then raise exception 'FALHA: membro renomeou grupo'; end if;
  end;
end $$;

-- despesa: cotas íntegras
do $$
declare g uuid := (select v from ids where k = 'g');
begin
  begin
    perform public.create_group_expense(g, 'Luz', 1000, 'Casa', '2026-11-20', 'igual', 'Convidado',
      '[{"uid":"00000000-0000-0000-0000-0000000000a1","amountCents":500,"paid":false},
        {"uid":"00000000-0000-0000-0000-0000000000a2","amountCents":400,"paid":true}]');
    raise exception 'FALHA: soma diferente do total aceita';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.create_group_expense(g, 'Luz', 1000, 'Casa', '2026-11-20', 'igual', 'Convidado',
      '[{"uid":"00000000-0000-0000-0000-0000000000a3","amountCents":1000,"paid":false}]');
    raise exception 'FALHA: cota de não membro aceita';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_group_expense(g, 'Luz', 1000, 'Casa', '2026-11-20', 'igual', 'Convidado',
      '[{"uid":"00000000-0000-0000-0000-0000000000a1","amountCents":500.5,"paid":false},
        {"uid":"00000000-0000-0000-0000-0000000000a2","amountCents":499.5,"paid":true}]');
    raise exception 'FALHA: centavos fracionados aceitos';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.create_group_expense(g, 'Luz', 1000, 'Casa', '2026-11-20', 'igual', 'Convidado',
      '[{"uid":"00000000-0000-0000-0000-0000000000a1","amountCents":500,"paid":false},
        {"uid":"00000000-0000-0000-0000-0000000000a1","amountCents":500,"paid":false}]');
    raise exception 'FALHA: cota repetida aceita';
  exception when sqlstate '22023' then null;
  end;
  insert into ids select 'e', public.create_group_expense(g, ' Luz ', 1000, 'Casa', '2026-11-20', 'igual', '',
    '[{"uid":"00000000-0000-0000-0000-0000000000a1","amountCents":500,"paid":false,"displayName":"Falso"},
      {"uid":"00000000-0000-0000-0000-0000000000a2","amountCents":500,"paid":true}]');
  if (select payer_display_name from public.group_expenses) <> 'Convidado' then
    raise exception 'FALHA: nome de quem pagou não veio do cadastro';
  end if;
  if (select display_name from public.group_expense_shares where user_id = '00000000-0000-0000-0000-0000000000a1') <> 'Dono' then
    raise exception 'FALHA: nome da cota veio do cliente';
  end if;
  begin
    update public.group_expense_shares set paid = true;
    raise exception 'FALHA: UPDATE direto em cota';
  exception when insufficient_privilege then null;
  end;
end $$;

-- quitação: dono quita a própria; estranho não; quem pagou quita a de outro
select pg_temp.login('00000000-0000-0000-0000-0000000000a3', 'estranho@exemplo.com') \g /dev/null
do $$ begin
  if exists (select 1 from public.group_expenses) or exists (select 1 from public.group_expense_shares) then
    raise exception 'FALHA: estranho vê despesa';
  end if;
  begin
    perform public.settle_group_expense_share((select v from ids where k = 'e'), '00000000-0000-0000-0000-0000000000a1');
    raise exception 'FALHA: estranho quitou cota';
  exception when sqlstate 'P0002' or insufficient_privilege then null;
  end;
end $$;

-- dono quita a própria cota
select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'dono@exemplo.com') \g /dev/null
do $$ begin
  perform public.settle_group_expense_share((select v from ids where k = 'e'));
  if not (select paid from public.group_expense_shares where user_id = '00000000-0000-0000-0000-0000000000a1') then
    raise exception 'FALHA: dono não quitou a própria cota';
  end if;
end $$;

-- membro comum (não pagou, não é dono) não quita cota alheia
insert into ids select 'e2', public.create_group_expense((select v from ids where k = 'g'), 'Água', 300, 'Casa', '2026-11-21', 'personalizado', 'Dono',
  '[{"uid":"00000000-0000-0000-0000-0000000000a1","amountCents":100,"paid":true},
    {"uid":"00000000-0000-0000-0000-0000000000a2","amountCents":200,"paid":false}]');
select pg_temp.login('00000000-0000-0000-0000-0000000000a2', 'convidado@exemplo.com') \g /dev/null
do $$ begin
  -- convidado não pagou a e2 nem é dono: não pode quitar a cota do dono
  begin
    perform public.settle_group_expense_share((select v from ids where k = 'e2'), '00000000-0000-0000-0000-0000000000a1');
    raise exception 'FALHA: membro quitou cota alheia';
  exception when insufficient_privilege then null;
  end;
  perform public.settle_group_expense_share((select v from ids where k = 'e2'));
  -- convidado não apaga despesa que não pagou
  delete from public.group_expenses where id = (select v from ids where k = 'e2');
  if not exists (select 1 from public.group_expenses where id = (select v from ids where k = 'e2')) then
    raise exception 'FALHA: membro apagou despesa alheia';
  end if;
end $$;

-- convidado recusa convite novo; dono apaga o grupo e tudo vai junto
select pg_temp.login('00000000-0000-0000-0000-0000000000a1', 'dono@exemplo.com') \g /dev/null
insert into ids select 'i2', public.create_group_invite((select v from ids where k = 'g'), 'outro@exemplo.com', 'Dono');
do $$ begin
  begin
    perform public.reject_group_invite((select v from ids where k = 'i2'));
    raise exception 'FALHA: dono recusou convite de outro e-mail';
  exception when sqlstate 'P0002' then null;
  end;
  delete from public.groups where id = (select v from ids where k = 'g');
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.group_members) or exists (select 1 from public.group_expense_shares)
     or exists (select 1 from public.group_invites) or exists (select 1 from public.group_expenses) then
    raise exception 'FALHA: apagar o grupo não levou membros, convites e despesas';
  end if;
end $$;

-- anon não lê nem chama as funções
set local role anon;
do $$ begin
  begin
    perform 1 from public.groups;
    raise exception 'FALHA: anon leu groups';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_group('X');
    raise exception 'FALHA: anon criou grupo';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
\echo 'rls_grupos: OK'
