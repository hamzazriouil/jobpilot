// ApplyVerdict mark: a Signal-lime tile with an ink evidence-trace line (docs/08-BRAND-UI.md §2).
// Same drawing as app/icon.svg and the OG image. Decorative: pair it with the wordmark or a label.
import { cn } from '@/lib/utils';

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true" className={cn('size-7 shrink-0', className)}>
      <rect x="1" y="1" width="26" height="26" rx="7" fill="#C6F432" />
      <path
        d="M6 15h4l2-6 4 11 2-5h4"
        fill="none"
        stroke="#0A0A0B"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
