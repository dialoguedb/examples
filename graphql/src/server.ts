/**
 * DialogueDB + Apollo Server — GraphQL Chat API
 *
 * A GraphQL API for AI-powered conversations with persistent history.
 * Apollo Server handles the GraphQL layer, DialogueDB stores the conversation
 * history, and GPT provides the AI responses.
 *
 * Run:  npm run dev
 * Then query at http://localhost:4000 with any GraphQL client.
 */

import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import OpenAI from "openai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import { typeDefs, createResolvers } from "./schema.js";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const server = new ApolloServer({
  typeDefs,
  resolvers: createResolvers(new DialogueDB(), new OpenAI()),
});

const port = parseInt(process.env.PORT ?? "4000");
const { url } = await startStandaloneServer(server, { listen: { port } });

console.log(`Chat GraphQL API running at ${url}`);
console.log(`
Example queries (paste into Apollo Sandbox or any GraphQL client):

  mutation {
    createChat(label: "my-chat", systemPrompt: "You are a helpful assistant.")
    { id label }
  }

  mutation {
    sendMessage(chatId: "<id>", message: "Hello!")
    { role content }
  }

  query {
    messages(chatId: "<id>")
    { role content }
  }

  query { chats { id label } }

  mutation { deleteChat(id: "<id>") }
`);
