import { test } from './fixtures';
import { luandaTime, nav, openDemo } from './helpers';

// The check every whole-app test makes (fixtures.ts): the app talks to no other server.

test.beforeEach(async ({ context }) => {
  await context.clock.install({ time: luandaTime('15:00') });
});

test('a WhatsApp link the person taps opens WhatsApp, and what its page asks for is not the app', async ({ page, context }) => {
  // WhatsApp, as it answers on the internet (here, without internet): wa.me sends the browser on to
  // its own page, which loads its own files and writes its own messages.
  await context.route('https://wa.me/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: `<script>location.replace('https://api.whatsapp.com/send/?phone=1')</script>` }),
  );
  await context.route('https://api.whatsapp.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<link rel="stylesheet" href="https://static.whatsapp.net/a.css"><script src="https://static.whatsapp.net/b.js"></script><script>console.error("The Content Security Policy directive 'upgrade-insecure-requests' is ignored when delivered in a report-only policy.")</script>`,
    }),
  );
  await context.route('https://static.whatsapp.net/**', (route) => route.fulfill({ body: '' }));
  await openDemo(page);
  await nav(page, 'Clientes');
  await page.getByRole('button', { name: /Joana Mateus/ }).click();
  const whatsApp = context.waitForEvent('page');
  await page.getByRole('link', { name: 'Lembrar por WhatsApp' }).click();
  const opened = await whatsApp;
  const said = opened.waitForEvent('console');
  await opened.waitForURL(/^https:\/\/api\.whatsapp\.com\/send\//);
  await said;
  await opened.close();
});

test('something the app itself sends out is caught (this test must fail)', async ({ page }) => {
  test.fail();
  await openDemo(page);
  // The browser refuses it (the app's security policy), and the check fails the test all the same.
  const refused = page.waitForEvent('console', (m) => m.text().includes('Content Security Policy'));
  await page.evaluate(() => fetch('https://example.org/recolha', { method: 'POST', body: 'dados' }).catch(() => undefined));
  await refused;
});
