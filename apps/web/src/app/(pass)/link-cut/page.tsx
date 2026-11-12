import { notFound } from "next/navigation";

/**
 * Where the proxy sends a URL with a broken percent-escape (a link cut off by a text message or a chat app). It answers 404 and the pass
 * 404 screen says "That link looks cut off. Copy the whole link from your text message, or ask the shop to send it again."
 */
export default function CutLink() {
  notFound();
}
