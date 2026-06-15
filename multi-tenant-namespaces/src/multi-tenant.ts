/**
 * Multi-Tenant Namespaces
 *
 * Namespaces let you isolate dialogues and memories per tenant within
 * a single DialogueDB project. Each tenant's data is invisible to others —
 * no cross-tenant leakage in queries, listings, or search results.
 *
 * This example simulates a SaaS support platform where two organizations
 * each have their own conversations and memories, fully isolated.
 */

import { DialogueDB, Dialogue, setGlobalConfig } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const db = new DialogueDB();

// Simulated tenant IDs — in production, derive from auth tokens or org records
const TENANT_ACME = "org-acme";
const TENANT_GLOBEX = "org-globex";

async function createTenantConversation(
  tenantId: string,
  label: string,
  messages: Array<{ role: string; content: string }>
): Promise<Dialogue> {
  // The namespace field scopes this dialogue to the tenant
  const dialogue = await db.createDialogue({
    namespace: tenantId,
    label,
    tags: ["support"],
  });

  for (const msg of messages) {
    await dialogue.saveMessage({ role: msg.role, content: msg.content });
  }

  return dialogue;
}

async function main() {
  // ── Step 1: Create conversations for two different tenants ──

  console.log("Creating conversations for two tenants...\n");

  const acmeDialogue = await createTenantConversation(
    TENANT_ACME,
    "billing-question",
    [
      { role: "user", content: "Why was I charged twice this month?" },
      {
        role: "assistant",
        content:
          "I can see a duplicate charge on your account. Let me look into this and issue a refund for the extra payment.",
      },
      { role: "user", content: "Thanks, how long will the refund take?" },
    ]
  );

  const globexDialogue = await createTenantConversation(
    TENANT_GLOBEX,
    "api-integration",
    [
      { role: "user", content: "How do I authenticate with your API?" },
      {
        role: "assistant",
        content:
          "You can authenticate using an API key in the Authorization header. Check your dashboard under Settings > API Keys.",
      },
    ]
  );

  console.log(`  Acme dialogue:   ${acmeDialogue.id} (${TENANT_ACME})`);
  console.log(`  Globex dialogue: ${globexDialogue.id} (${TENANT_GLOBEX})`);

  // ── Step 2: Store tenant-specific memories ──

  console.log("\nStoring per-tenant memories...");

  const acmeMemory = await db.createMemory({
    namespace: TENANT_ACME,
    label: "account-tier",
    value: { plan: "enterprise", seats: 50, renewsAt: "2026-12-01" },
    tags: ["account-info"],
  });

  const globexMemory = await db.createMemory({
    namespace: TENANT_GLOBEX,
    label: "account-tier",
    value: { plan: "starter", seats: 5, renewsAt: "2026-09-15" },
    tags: ["account-info"],
  });

  console.log(`  Acme memory:   ${acmeMemory.id}`);
  console.log(`  Globex memory: ${globexMemory.id}`);

  // ── Step 3: List dialogues scoped to a single tenant ──

  console.log("\nListing Acme's dialogues (Globex data excluded):");

  const acmeDialogues = await db.listDialogues({ namespace: TENANT_ACME });
  for (const d of acmeDialogues.items) {
    console.log(`  [${d.namespace}] ${d.label} — ${d.totalMessages} messages`);
  }

  console.log("\nListing Globex's dialogues (Acme data excluded):");

  const globexDialogues = await db.listDialogues({ namespace: TENANT_GLOBEX });
  for (const d of globexDialogues.items) {
    console.log(`  [${d.namespace}] ${d.label} — ${d.totalMessages} messages`);
  }

  // ── Step 4: Retrieve and list memories scoped to a tenant ──

  console.log("\nRetrieving Acme's memories:");

  const acmeMemories = await db.listMemories({ namespace: TENANT_ACME });
  for (const m of acmeMemories.items) {
    console.log(`  ${m.label}: ${JSON.stringify(m.value)}`);
  }

  // ── Step 5: Retrieve a dialogue using namespace for precise lookup ──

  console.log("\nRetrieving Acme's dialogue by ID + namespace:");

  const retrieved = await db.getDialogue(acmeDialogue.id, {
    namespace: TENANT_ACME,
  });
  if (retrieved) {
    await retrieved.loadMessages({ order: "asc" });
    console.log(
      `  Found: "${retrieved.label}" with ${retrieved.messages.length} messages`
    );
  }

  // ── Cleanup ──

  await db.deleteDialogue(acmeDialogue.id, { namespace: TENANT_ACME });
  await db.deleteDialogue(globexDialogue.id, { namespace: TENANT_GLOBEX });
  await db.deleteMemory(acmeMemory.id, { namespace: TENANT_ACME });
  await db.deleteMemory(globexMemory.id, { namespace: TENANT_GLOBEX });
  console.log("\nCleaned up all tenant data. Done!");
}

main().catch(console.error);
