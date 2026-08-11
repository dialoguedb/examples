import { DialogueDB, setGlobalConfig } from "dialogue-db";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

export const db = new DialogueDB();
