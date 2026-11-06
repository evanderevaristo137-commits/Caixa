import { useEffect, useRef, useState } from 'react';
import { t } from '../../i18n/pt-AO';
import { Sheet } from '../../ui/kit';

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

function getDetector(): BarcodeDetectorCtor | undefined {
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
}

export const scannerSupported = () => typeof window !== 'undefined' && !!getDetector() && !!navigator.mediaDevices;

/** Reads a barcode with the camera using Chrome's built-in detector (no extra download). */
export function Scanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(scannerSupported() ? null : t.scanner.notSupported);

  useEffect(() => {
    const Detector = getDetector();
    if (!Detector) return;
    let stream: MediaStream | undefined;
    let timer: number | undefined;
    let stopped = false;
    const detector = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'] });

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(async (s) => {
        stream = s;
        if (stopped || !video.current) return s.getTracks().forEach((tr) => tr.stop());
        video.current.srcObject = s;
        await video.current.play();
        const tick = async () => {
          if (stopped || !video.current) return;
          try {
            const codes = await detector.detect(video.current);
            const code = codes[0]?.rawValue;
            if (code) {
              navigator.vibrate?.(80);
              onCode(code);
              return;
            }
          } catch {
            /* frame not ready yet */
          }
          timer = window.setTimeout(tick, 200);
        };
        void tick();
      })
      .catch(() => setError(t.scanner.denied));

    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [onCode]);

  return (
    <Sheet title={t.scanner.title} onClose={onClose}>
      {error ? (
        <p className="pb-4 text-lg text-slate-700">{error}</p>
      ) : (
        <div className="relative mb-4 overflow-hidden rounded-xl bg-black">
          <video ref={video} className="aspect-[4/3] w-full object-cover" playsInline muted />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
        </div>
      )}
    </Sheet>
  );
}
