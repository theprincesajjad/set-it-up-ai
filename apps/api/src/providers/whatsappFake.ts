import { randomToken } from "../lib/crypto.js";
import type { WhatsAppProvider, WhatsAppTemplateSend, WhatsAppTextSend } from "./whatsapp.js";

export type RecordedWhatsApp =
  | ({ kind: "template"; id: string; at: Date } & WhatsAppTemplateSend)
  | ({ kind: "text"; id: string; at: Date } & WhatsAppTextSend);

/** Records every send so tests and dev tools can inspect them. Set `failNext` to simulate a Graph API error. */
export class FakeWhatsApp implements WhatsAppProvider {
  name = "fake";
  sent: RecordedWhatsApp[] = [];
  failNext = 0;

  private check() {
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error("WhatsApp send failed (400 131047): re-engagement message");
    }
  }

  async sendTemplate(msg: WhatsAppTemplateSend): Promise<{ id: string }> {
    this.check();
    const id = `wamid.fake_${randomToken(6)}`;
    this.sent.push({ kind: "template", id, at: new Date(), ...msg });
    return { id };
  }

  async sendText(msg: WhatsAppTextSend): Promise<{ id: string }> {
    this.check();
    const id = `wamid.fake_${randomToken(6)}`;
    this.sent.push({ kind: "text", id, at: new Date(), ...msg });
    return { id };
  }

  reset() {
    this.sent = [];
    this.failNext = 0;
  }
}
