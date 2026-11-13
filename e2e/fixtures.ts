import { expect, test as base, type Request } from '@playwright/test';

/**
 * Every test of the whole app also checks the promise «os dados ficam no telemóvel»: while it is
 * used, the app asks nothing of any other server. A request blocked by the app's security policy
 * counts too: it would be a bug, even if the browser stopped it.
 *
 * A WhatsApp link only opens when the person taps it: WhatsApp then shows the message, to read
 * before sending. Opening it (wa.me, and where WhatsApp sends the browser on) is allowed, and
 * what WhatsApp's own page asks for is WhatsApp's, not the app's.
 */
export const test = base.extend<{ allowOutside: string[]; onlyOwnServer: void }>({
  /** Addresses a test reaches on purpose (to prove the browser refuses them), never the app. */
  allowOutside: [[], { option: true }],
  onlyOwnServer: [
    async ({ context, baseURL, allowOutside }, use) => {
      const own = new URL(baseURL!).origin;
      const isOwn = (url: string) => url.startsWith(`${own}/`);
      /** The page that made the request ('' for the app's offline worker, which has no page). */
      const madeBy = (request: Request) => {
        try {
          return request.frame().url();
        } catch {
          return '';
        }
      };
      const outside: string[] = [];
      context.on('request', (request) => {
        const url = request.url();
        if (isOwn(url) || !/^(https?|wss?):/.test(url)) return;
        if (request.isNavigationRequest()) {
          if (url.startsWith('https://wa.me/') || url.startsWith('https://api.whatsapp.com/')) return;
        } else {
          const page = madeBy(request);
          if (page !== '' && !isOwn(page)) return; // another site's page (WhatsApp), not the app
        }
        outside.push(`${request.method()} ${url}`);
      });
      context.on('console', (message) => {
        const page = message.page()?.url() ?? '';
        if (page !== '' && !isOwn(page)) return;
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
