# Multi-Tenant Namespaces

A [DialogueDB](https://dialoguedb.com) example showing how to use **namespaces** to isolate conversations and memories per tenant in a multi-tenant application.

## Why namespaces?

If you're building a SaaS product where multiple organizations share the same DialogueDB project, namespaces ensure:

- **Data isolation** — one tenant's conversations never appear in another's queries
- **Simpler architecture** — no need for per-tenant API keys or separate projects
- **Scoped operations** — list, search, get, and delete all respect namespace boundaries

## Setup

```bash
npm install
cp .env.example .env
# Fill in your DialogueDB API key and endpoint
```

## Run

```bash
npm start
```

## What it demonstrates

1. **Create dialogues** with a `namespace` field to scope them to a tenant
2. **Store memories** namespaced to each tenant (e.g., account preferences)
3. **List dialogues** filtered by namespace — only that tenant's data is returned
4. **Retrieve by ID + namespace** for precise lookups that enforce tenant boundaries
5. **Delete with namespace** to ensure cleanup targets the correct tenant's data

## Using in production

In a real application, derive the namespace from your auth layer:

```typescript
app.use((req, res, next) => {
  // Extract tenant from JWT, session, or API key
  req.tenantNamespace = `org-${req.auth.organizationId}`;
  next();
});

// All DialogueDB operations use the tenant namespace
const dialogue = await db.createDialogue({
  namespace: req.tenantNamespace,
  label: "support-ticket",
});
```

## Next steps

- [`../persist-and-resume/`](../persist-and-resume/) — Basic persist and resume pattern
- [`../hono/`](../hono/) — REST API server (add namespaces to your routes)
- [`../openai-sdk/`](../openai-sdk/) — OpenAI chat with persistent memory
