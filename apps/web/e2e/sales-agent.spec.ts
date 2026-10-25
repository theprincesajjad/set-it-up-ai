/**
 * The sales assistant, end to end on the real stack (API in NODE_ENV=test with no ANTHROPIC_API_KEY, so the model is "offline"):
 * the website widget discloses that it is an AI before the visitor types, a message lands in the founder's queue with the
 * offline notice, the founder takes over and replies from the console, the visitor sees the person's reply, and the console's
 * thumbs and Quality tab work. Also: no WhatsApp button without a configured number, and the pre-filled sign-up link.
 */
import { expect, test, type Page } from "@playwright/test";
import { API } from "./fixtures";

/** Screenshots next to the Figma frames when AGENT_SHOTS is set (untracked). */
const shot = async (page: Page, name: string) => {
  if (process.env.AGENT_SHOTS) await page.screenshot({ path: `${process.env.AGENT_SHOTS}/${name}.png` });
};
const ADMIN = { email: "admin@localloyalty.example", password: "localloyalty-admin" };

async function signIn(page: Page, who: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test.describe("website chat and the founder's console", () => {
  test("the visitor is told it is an AI, a person takes over from the console and the visitor sees the reply", async ({ browser }) => {
    const visitorCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const visitor = await visitorCtx.newPage();
    await visitor.goto("/");
    // No number is configured in this build: there is no WhatsApp button, never a placeholder link.
    await expect(visitor.getByRole("link", { name: "Message us on WhatsApp" })).toHaveCount(0);
    await visitor.getByRole("button", { name: "Ask us" }).click();
    const chat = visitor.getByRole("dialog", { name: "Ask us anything" });
    await expect(chat).toBeVisible();
    // The disclosure is there before anyone types.
    await expect(chat).toContainText("AI assistant");
    await expect(chat).toContainText("HUMAN");
    await expect(chat.getByRole("button", { name: "What does it cost?" })).toBeVisible();
    await expect(chat).toContainText("Chats are kept 90 days.");
    await expect(chat.getByRole("link", { name: "Continue on WhatsApp" })).toHaveCount(0);
    await shot(visitor, "widget-first-open-390");

    const question = `What does it cost? (${Date.now()})`;
    await chat.getByLabel("Type your question").fill(question);
    await chat.getByRole("button", { name: "Send" }).click();
    await expect(chat.getByText(question)).toBeVisible();
    await expect(chat.getByText("Our assistant is not available right now.")).toBeVisible();
    // one disclosure only: the first line the server sent replaced the pre-chat copy
    await expect(chat.getByText(/I'm Local Loyalty's AI assistant/)).toHaveCount(1);
    await shot(visitor, "widget-offline-390");

    // The same tab keeps the chat across a page change.
    await visitor.goto("/pricing");
    await visitor.getByRole("button", { name: "Ask us" }).click();
    await expect(visitor.getByRole("dialog", { name: "Ask us anything" }).getByText(question)).toBeVisible();

    // ---- The founder
    const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const admin = await adminCtx.newPage();
    await signIn(admin, ADMIN);
    await admin.goto("/admin/sales-agent");
    await expect(admin.getByRole("heading", { level: 1, name: "Sales agent" })).toBeVisible();
    await expect(admin.getByRole("radio", { name: /Needs a person/ })).toBeChecked();
    // the list shows the newest line of each chat: here the offline notice
    const row = admin.getByRole("list", { name: "Conversations" }).getByRole("button").filter({ hasText: "Our assistant is not available" }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText("Needs a person");
    await row.click();
    const thread = admin.getByLabel("Messages");
    await expect(thread).toContainText(question);
    await expect(thread).toContainText("Handoff requested: assistant_unavailable");
    await shot(admin, "console-inbox-1440");

    // thumbs on the assistant's answer
    const down = admin.getByRole("button", { name: "Bad answer" }).last();
    await down.click();
    await expect(down).toHaveAttribute("aria-pressed", "true");

    await admin.getByRole("button", { name: "Take over" }).click();
    await expect(admin.getByText("You have this chat. The assistant stays quiet.")).toBeVisible();
    await admin.getByLabel(/Replying as a person/).fill("Hi, this is the founder. Happy to help with pricing.");
    await admin.getByRole("button", { name: "Send" }).click();
    await expect(thread).toContainText("Hi, this is the founder. Happy to help with pricing.");

    // ---- The visitor sees the person's reply (the widget polls while a person is involved)
    await expect(visitor.getByRole("dialog", { name: "Ask us anything" }).getByText("Hi, this is the founder. Happy to help with pricing.")).toBeVisible({ timeout: 20_000 });
    await expect(visitor.getByRole("dialog", { name: "Ask us anything" }).getByText("A person from the team has joined this chat.")).toBeVisible();

    // ---- Rated down shows in the list and in Quality
    await admin.getByRole("radio", { name: "Rated down" }).click();
    await expect(admin.getByRole("list", { name: "Conversations" }).getByRole("button").filter({ hasText: /1 rated down/ }).first()).toBeVisible();
    await admin.getByRole("radio", { name: "Quality" }).click();
    await expect(admin.getByText(/Eval set · \d+ questions/)).toBeVisible();
    await expect(admin.getByText("No model is configured")).toBeVisible();
    await expect(admin.getByText("How much is the Growth plan for my restaurant?")).toBeVisible();
    await shot(admin, "console-quality-1440");

    await visitorCtx.close();
    await adminCtx.close();
  });

  test("the API refuses the console to anyone but an admin, and a visitor's session token is not guessable", async ({ request }) => {
    expect((await request.get(`${API}/v1/admin/sales-agent/conversations`)).status()).toBe(401);
    const poll = await request.get(`${API}/v1/public/sales-agent/messages`, { headers: { "x-agent-session": "wc_notarealtokennotarealtoken" } });
    expect(poll.status()).toBe(200);
    expect((await poll.json()).lines).toEqual([]);
    const status = await (await request.get(`${API}/v1/public/sales-agent/status`)).json();
    expect(status).toEqual({ enabled: true, whatsappNumber: null });
  });

  test("the assistant's sign-up link opens the form pre-filled, and only with safe values", async ({ page }) => {
    await page.goto("/signup?ref=assistant&shop=Nawab%20Biryani%20House&vertical=restaurant&phone=%2B16475550199");
    await expect(page.getByLabel("Shop name")).toHaveValue("Nawab Biryani House");
    await expect(page.getByRole("radio", { name: "Restaurant", exact: true })).toBeChecked();
    await expect(page.getByLabel("Your mobile number")).toHaveValue(/647.*555.*0199/);
    await page.goto("/signup?shop=%3Cscript%3Ealert(1)%3C%2Fscript%3E&vertical=weapons");
    await expect(page.getByLabel("Shop name")).toHaveValue("scriptalert(1)/script");
    await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
  });
});
