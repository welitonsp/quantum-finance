-- Pergunta do diário de decisões: mesmo limite do validador do Agente (2000).
-- Precisa trocar a constraint da 0010 (<= 500); a tabela ainda não tem escritor.
alter table public.ai_decisions drop constraint if exists ai_decisions_question_check;
alter table public.ai_decisions
  add constraint ai_decisions_question_check check (char_length(question) <= 2000);
