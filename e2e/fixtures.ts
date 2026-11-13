import { expect, test as base } from '@playwright/test';

/**
 * Every test of the whole app also checks the promise «os dados ficam no telemóvel»: while it is
 * used, the app asks nothing of any other server. A WhatsApp link only opens when the person taps it
 * (the tests read its address, they never follow it). A request blocked by the app's security policy
 * counts too: it would be a bug, even if the browser stopped it.
 */
export const test = base.extend<{ allowOutside: string[]; onlyOwnServer: void }>({
  /** Addresses a test reaches on purpose (to prove the browser refuses them), never the app. */
  allowOutside: [[], { option: true }],
  onlyOwnServer: [
    async ({ context, baseURL, allowOutside }, use) => {
      const own = new URL(baseURL!).origin;
      const outside: string[] = [];
      context.on('request', (request) => {
        const url = request.url();
        if (url.startsWith(`${own}/`) || !/^(https?|wss?):/.test(url)) return;
        // A WhatsApp link the person tapped: it opens WhatsApp, where they see the message before sending it.
        if (request.isNavigationRequest() && url.startsWith('https://wa.me/')) return;
        outside.push(`${request.method()} ${url}`);
      });
      context.on('console', (message) => {
        if (message.type() === 'error' && message.text().includes('Content Security Policy')) outside.push(message.text());
      });
      await use();
      const unexpected = outside.filter((what) => !allowOutside.some((allowed) => what.includes(allowed)));
      expect(unexpected, 'a app tentou falar com um servidor de fora').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
