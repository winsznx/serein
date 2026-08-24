/**
 * The Serein mark.
 *
 * "Serein" is the fine rain that falls from a clear evening sky — visible only if you look for it.
 * The mark is that: a set of descending strokes that resolve into a shape at a glance and stay
 * abstract up close, drawn at the same 1.5px stroke weight as the rest of the iconography.
 *
 * Deliberately not a lock, a shield, or an eye. Privacy products reach for those by reflex, and they
 * make a savings account look like a security appliance.
 */
export function SereinMark({
  size = 28,
  className,
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      className={className}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <circle cx="14" cy="14" r="13" stroke="currentColor" strokeWidth="1.5" opacity="0.28" />
      <path
        d="M9 7.5v6.2a5 5 0 0 0 10 0V7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M14 16.6v4.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="14" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function SereinWordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className="inline-flex items-center gap-2.5">
        <SereinMark size={26} className="text-violet" title="Serein" />
        <span className="text-subheading font-medium tracking-[-0.03em]">Serein</span>
      </span>
    </span>
  );
}
