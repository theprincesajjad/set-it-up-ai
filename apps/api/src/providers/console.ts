import { randomToken } from "../lib/crypto.js";
import type { EmailProvider, Outbox, PushProvider, SmsProvider } from "./types.js";

const MAX_OUTBOX = 500;
const push = <T>(arr: T[], item: T) => {
  arr.push(item);
  if (arr.length > MAX_OUTBOX) arr.shift();
};

export function consoleSms(outbox: Outbox, log = false): SmsProvider {
  return {
    name: "console",
    async send(to, body) {
      push(outbox.sms, { to, body, at: new Date() });
      if (log) console.log(`[sms -> ${to}] ${body}`);
      return { id: `console_${randomToken(6)}` };
    },
  };
}

export function consoleEmail(outbox: Outbox, log = false): EmailProvider {
  return {
    name: "console",
    async send({ to, subject, text }) {
      push(outbox.email, { to, subject, text, at: new Date() });
      if (log) console.log(`[email -> ${to}] ${subject}\n${text}`);
      return { id: `console_${randomToken(6)}` };
    },
  };
}

export function consolePush(outbox: Outbox, log = false): PushProvider {
  return {
    name: "console",
    async send(msgs) {
      for (const m of msgs) {
        push(outbox.push, { token: m.token, title: m.title, body: m.body, at: new Date() });
        if (log) console.log(`[push -> ${m.token}] ${m.title}: ${m.body}`);
      }
      return { ok: msgs.length, failed: 0 };
    },
  };
}
