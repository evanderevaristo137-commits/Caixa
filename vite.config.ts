/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// On GitHub Pages the app lives under /<repo-name>/; the CI sets BASE_PATH.
const base = process.env.BASE_PATH ?? '/';

/**
 * Content Security Policy of the published app: the browser itself refuses to load code from
 * anywhere else or to send data anywhere (connect-src 'self'). This is what makes the promise
 * "the data stay on the phone" a rule, not only good behaviour. WhatsApp links still open (they are
 * navigation, not requests from the app). Only in the build: the development server needs more.
 * GitHub Pages cannot send headers, so it goes in a <meta> (frame-ancestors is not possible there).
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'caixa-content-security-policy',
    apply: 'build',
    // Right after the charset (which must come first), before any script or style.
    transformIndexHtml: (html) => {
      const charset = '<meta charset="UTF-8" />';
      if (!html.includes(charset)) throw new Error('index.html: charset meta not found');
      return html.replace(charset, `${charset}\n    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />`);
    },
  };
}

export default defineConfig({
  base,
  plugins: [
    contentSecurityPolicy(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Caixa',
        short_name: 'Caixa',
        description: 'A caixa da sua loja no telemóvel',
        lang: 'pt-AO',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f8fafc',
        theme_color: '#047857',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // sw-alerts.js is loaded by importScripts, not precached as a page asset.
        globIgnores: ['sw-alerts.js'],
        navigateFallback: 'index.html',
        // Background payment reminders (see public/sw-alerts.js).
        importScripts: ['sw-alerts.js'],
      },
    }),
  ],
  test: {
    environment: 'node',
    setupFiles: ['src/test-setup.ts'],
  },
});
