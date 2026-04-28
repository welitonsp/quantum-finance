# Segurança

## Segredos

O frontend nunca deve conter chaves Gemini, OpenAI, Firebase Admin ou qualquer segredo operacional. Variáveis `VITE_*` são públicas por definição no build do Vite.

Permitido no frontend:

- Firebase Web API key e identificadores públicos do projeto.
- Chamadas `httpsCallable` para Cloud Functions autenticadas.

Proibido no frontend:

- clientes diretos Gemini/OpenAI.
- variáveis de ambiente de IA com prefixo `VITE_`.
- credenciais de serviço Firebase Admin.

Gemini deve ser configurado somente no backend:

```bash
firebase functions:secrets:set GEMINI_API_KEY
firebase deploy --only functions
```

## IA via Cloud Functions

`src/features/ai-chat/GeminiService.ts` é um wrapper de `httpsCallable`. A Cloud Function valida autenticação, aplica limite por usuário e usa o Secret Manager para ler a chave Gemini.

Antes de enviar contexto financeiro, o cliente aplica `piiMasker` e o servidor aplica uma segunda camada de máscara. Respostas de categorização são restringidas a `ALLOWED_CATEGORIES`; qualquer categoria fora da lista vira `Outros`.

## Firestore Rules

`firestore.rules` valida subcoleções em `users/{uid}` e exige `request.auth.uid == uid`. Transações v2 devem usar `value_cents` inteiro, `schemaVersion == 2`, `type` canônico e `updatedAt == request.time`.

`audit_logs` e `system_logs` são append-only. Deletes físicos de transações são bloqueados; o app usa soft delete com `isDeleted`, `deletedAt` e `updatedAt`.

## Importação

Importação financeira crítica passa pelo `LedgerService`, que usa IDs determinísticos por hash. Isso impede duplicidade em reprocessamento, refresh, retry de rede e importação repetida do mesmo arquivo.

## CI de segurança

`.github/workflows/security.yml` bloqueia:

- variável pública de Gemini com prefixo `VITE_` em arquivos versionáveis.
- `.env` real versionado.
- padrões comuns de segredo acidental.

O workflow não substitui Secret Manager nem revisão humana; ele reduz vazamento acidental antes de merge.
