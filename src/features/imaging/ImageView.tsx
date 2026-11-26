import { ChevronLeft, ChevronRight, ImageOff, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApp, useRecord } from '@/app/store';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { engine } from '@/engine/client';
import { digits, ltr, t, term } from '@/i18n';
import { translateError } from '@/i18n/errors';
import { useAsync } from '@/lib/useAsync';
import type { Adjustment, FrameImage } from '@/parsers/dicom/pixels';

const NEUTRAL: Adjustment = { brightness: 0, contrast: 0 };

async function draw(canvas: HTMLCanvasElement, image: FrameImage): Promise<void> {
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) return;
  if (image.rgba) {
    context.putImageData(new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height), 0, 0);
  } else if (image.jpeg) {
    // The bytes go straight to the browser's decoder: no address is made, so nothing can be requested.
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(image.jpeg)], { type: 'image/jpeg' }));
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
  }
}

function Slider({ id, label, value, onChange }: { id: string; label: string; value: number; onChange(value: number): void }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-[13px] text-muted">
      <span className="w-20 shrink-0">{label}</span>
      <input id={id} type="range" min={-100} max={100} step={2} value={value} onChange={(event) => onChange(Number(event.target.value))} className="min-w-0 flex-1 accent-(--color-accent)" />
    </label>
  );
}

/** The picture viewer of a DICOM file: one image at a time, with brightness and contrast for greyscale scans. */
export function ImageView() {
  const record = useRecord();
  const scrubbed = useApp((state) => state.scrubbed);
  const imaging = record.imaging!;
  const [index, setIndex] = useState(0);
  const [adjustment, setAdjustment] = useState(NEUTRAL);
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = Math.min(index, Math.max(0, imaging.frames - 1));
  const changed = adjustment.brightness !== 0 || adjustment.contrast !== 0;
  const image = useAsync(imaging.frames ? `${frame}|${adjustment.brightness}|${adjustment.contrast}|${scrubbed}` : null, () =>
    engine.call('imageFrame', frame, changed ? { adjustment } : undefined),
  );

  useEffect(() => {
    if (image.value && canvas.current) void draw(canvas.current, image.value);
  }, [image.value]);

  const step = (by: number) => setIndex(Math.min(imaging.frames - 1, Math.max(0, frame + by)));

  return (
    <div className="mx-auto grid max-w-6xl gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_20rem]" data-testid="image-view">
      <Card title={t('images.title')} aside={imaging.frames > 1 ? t('images.position', { current: frame + 1, total: imaging.frames }) : undefined} flush>
        {imaging.frames === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center" data-testid="image-unavailable">
            <ImageOff size={32} className="text-muted" aria-hidden="true" />
            <p className="max-w-md text-sm text-ink">{translateError(imaging.unavailable) ?? t('images.none')}</p>
            <p className="max-w-md text-[13px] text-muted">{t('images.detailsStill')}</p>
          </div>
        ) : (
          <>
            <div
              className="flex items-center justify-center bg-black p-2"
              onWheel={(event) => imaging.frames > 1 && step(event.deltaY > 0 ? 1 : -1)}
            >
              <canvas
                ref={canvas}
                role="img"
                aria-label={t('images.alt', { current: frame + 1, total: imaging.frames })}
                data-testid="image-canvas"
                className="max-h-[70vh] w-auto max-w-full"
                style={{ imageRendering: imaging.width < 400 ? 'pixelated' : 'auto', minWidth: 'min(100%, 24rem)' }}
              />
            </div>
            <div className="flex flex-col gap-3 border-t border-line p-3">
              {imaging.frames > 1 && (
                <div className="flex items-center gap-2" dir="ltr">
                  <Button size="sm" variant="ghost" aria-label={t('images.previous')} disabled={frame === 0} onClick={() => step(-1)}>
                    <ChevronLeft size={16} />
                  </Button>
                  <input
                    type="range"
                    min={1}
                    max={imaging.frames}
                    value={frame + 1}
                    aria-label={t('images.choose')}
                    data-testid="image-slider"
                    onChange={(event) => setIndex(Number(event.target.value) - 1)}
                    className="min-w-0 flex-1 accent-(--color-accent)"
                  />
                  <Button size="sm" variant="ghost" aria-label={t('images.next')} disabled={frame === imaging.frames - 1} onClick={() => step(1)}>
                    <ChevronRight size={16} />
                  </Button>
                </div>
              )}
              {imaging.greyscale && (
                <div className="grid items-center gap-x-4 gap-y-2 sm:grid-cols-[1fr_1fr_auto]">
                  <Slider id="image-brightness" label={t('images.brightness')} value={adjustment.brightness} onChange={(brightness) => setAdjustment({ ...adjustment, brightness })} />
                  <Slider id="image-contrast" label={t('images.contrast')} value={adjustment.contrast} onChange={(contrast) => setAdjustment({ ...adjustment, contrast })} />
                  <Button size="sm" variant="ghost" disabled={!changed} onClick={() => setAdjustment(NEUTRAL)} data-testid="image-reset">
                    <RotateCcw size={14} /> {t('images.reset')}
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted">{t('images.notice')}</p>
            </div>
          </>
        )}
      </Card>

      <Card title={t('images.details')} flush>
        <dl className="divide-y divide-line text-[13px]">
          {imaging.details.map((detail) => (
            <div key={detail.label} className="flex gap-3 px-4 py-2">
              <dt className="w-28 shrink-0 text-muted">{term(detail.label)}</dt>
              <dd className="min-w-0 break-words text-ink">{/^\d+$/.test(detail.value) ? digits(detail.value) : ltr(detail.value)}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
