import { downloadText } from './download';

export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

/**
 * Opens Android's share menu (WhatsApp, e-mail, Drive…) with the file.
 * Where sharing files isn't possible, saves it to the Downloads folder instead.
 * Note: Chrome only shares some file types (e.g. .txt and .csv, not .json).
 */
export async function shareOrDownload(filename: string, content: string, mime: string, title: string): Promise<ShareResult> {
  try {
    const file = new File([content], filename, { type: mime });
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return 'shared';
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    // Any other problem (e.g. permission): fall back to a normal download.
  }
  downloadText(filename, content, mime);
  return 'downloaded';
}
