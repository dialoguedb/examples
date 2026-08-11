# Twilio SMS Chatbot with DialogueDB

An AI-powered SMS chatbot that remembers conversations using DialogueDB. Text your Twilio number, get an intelligent reply — and the assistant picks up right where you left off, even days later.

## Why DialogueDB?

SMS is inherently stateless — each text arrives as an isolated webhook with no built-in session. DialogueDB gives you:

- **Per-number memory** — each phone number's conversation is stored as a separate dialogue, found by tag
- **Survives restarts** — history is loaded from DialogueDB on every incoming text, not kept in RAM
- **Async-friendly** — someone can text Monday, get a reply, text again Thursday, and the assistant remembers both
- **Searchable metadata** — every message is tagged with the phone number that sent it

## How it works

1. Someone texts your Twilio phone number
2. Twilio POSTs the message to your `/sms` webhook
3. Server looks up (or creates) a DialogueDB dialogue tagged with the sender's phone number
4. Conversation history is sent to OpenAI as context
5. The AI response is persisted to DialogueDB and returned as TwiML

## Setup

### 1. Get a Twilio phone number

1. Sign up at [twilio.com](https://www.twilio.com) (free trial includes a phone number)
2. Go to **Phone Numbers** → **Manage** → **Active numbers**
3. Under **Messaging**, set the webhook URL to `https://<your-server>/sms` (POST)

> **Local development:** Use [ngrok](https://ngrok.com) to expose your local server: `ngrok http 3000`, then paste the HTTPS URL into Twilio.

### 2. Configure environment

```bash
cp .env.example .env
# Fill in your OpenAI API key and DialogueDB credentials
```

### 3. Install and run

```bash
npm install
npm start
```

### 4. Text it

Send a text to your Twilio number. The assistant will respond — and remember the conversation next time.

## Project structure

```
twilio-sms/
├── src/
│   └── server.ts       # Webhook server with DialogueDB persistence
├── .env.example        # Required environment variables
├── package.json
├── tsconfig.json
└── README.md
```

## Key patterns

**Phone number → dialogue lookup via tags** — each number gets an isolated conversation:

```typescript
const list = await db.listDialogues();
const existing = list.items.find((d) =>
  d.tags?.includes(`phone:${phoneNumber}`)
);
```

**SMS-optimized prompting** — the system prompt tells the model to keep responses concise for text messages:

```typescript
const SYSTEM_PROMPT =
  "You are a helpful SMS assistant. Keep responses concise — they are sent as text messages.";
```

**TwiML response** — Twilio expects XML, not JSON. The server returns a `<Message>` wrapped in a `<Response>`:

```typescript
res.type("text/xml").send(twimlResponse(reply));
```

## Production notes

- **Webhook validation:** In production, validate that requests actually come from Twilio using the [`twilio`](https://www.npmjs.com/package/twilio) package's `validateRequest` function and your auth token.
- **Message length:** SMS has a 1600-character limit per message. The system prompt asks the model to stay concise, but you may want to truncate or split long responses.
- **Rate limiting:** Twilio has rate limits on outbound SMS. For high-traffic numbers, consider queuing responses.
