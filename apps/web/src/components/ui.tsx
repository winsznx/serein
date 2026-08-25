import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from "react";

/**
 * The component vocabulary.
 *
 * Everything visual in Serein is built from these. The constraints they encode — pill CTAs, 20px
 * cards, weights capped at 500, one accent colour, no shadows — are enforced here rather than
 * repeated at each call site, so a screen written in a hurry still comes out on-system.
 */

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonTone = "violet" | "light" | "dark" | "ghost-light" | "ghost-dark" | "outline-violet";
type ButtonSize = "md" | "lg";

const TONE: Record<ButtonTone, string> = {
  violet: "bg-violet text-white hover:bg-violet-dim active:bg-violet-dim",
  light: "bg-paper text-midnight hover:bg-bone active:bg-ash/60",
  dark: "bg-abyss text-white hover:bg-midnight active:bg-midnight",
  "ghost-light": "border border-ash/70 text-midnight hover:bg-bone active:bg-ash/30",
  "ghost-dark": "border border-white/25 text-white hover:bg-white/10 active:bg-white/15",
  "outline-violet": "border border-violet text-violet hover:bg-violet/10 active:bg-violet/15",
};

const SIZE: Record<ButtonSize, string> = {
  // 44px minimum touch target, per the accessibility floor for anything tappable.
  md: "min-h-11 px-5 py-2.5 text-small",
  lg: "min-h-12 px-6 py-3 text-body",
};

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-pill font-medium transition-colors " +
  "duration-150 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ButtonTone;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** React 19 passes refs to function components as an ordinary prop. */
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  tone = "violet",
  size = "md",
  fullWidth,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(BUTTON_BASE, TONE[tone], SIZE[size], fullWidth && "w-full", className)}
    >
      {children}
    </button>
  );
}

interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  tone?: ButtonTone;
  size?: ButtonSize;
  fullWidth?: boolean;
}

export function ButtonLink({
  href,
  tone = "violet",
  size = "md",
  fullWidth,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  const classes = cn(BUTTON_BASE, TONE[tone], SIZE[size], fullWidth && "w-full", className);
  if (href.startsWith("http") || href.startsWith("mailto:")) {
    return (
      <a href={href} rel="noreferrer noopener" target="_blank" className={classes} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes} {...rest}>
      {children}
    </Link>
  );
}

export function Card({
  children,
  className,
  surface = "dark",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  surface?: "dark" | "light" | "deep";
  as?: "div" | "section" | "article" | "li";
}) {
  const surfaces = {
    dark: "bg-slate/60 border border-white/10",
    deep: "bg-abyss border border-white/10",
    light: "bg-paper border border-ash/50",
  } as const;
  return <Tag className={cn("rounded-card p-6", surfaces[surface], className)}>{children}</Tag>;
}

export function Badge({
  children,
  tone = "neutral",
  icon,
}: {
  children: ReactNode;
  tone?: "neutral" | "violet" | "light";
  icon?: ReactNode;
}) {
  const tones = {
    neutral: "bg-white/10 text-white/85",
    violet: "bg-violet/15 text-violet",
    light: "bg-bone text-midnight",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-badge px-2.5 py-1 text-caption font-medium",
        tones[tone],
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Section label that introduces a band. Sits above the headline, centred or left. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-caption font-medium uppercase tracking-[0.14em] text-violet">{children}</p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  lead,
  align = "left",
  action,
  surface = "dark",
}: {
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  align?: "left" | "center";
  action?: ReactNode;
  surface?: "dark" | "light";
}) {
  const muted = surface === "dark" ? "text-white/65" : "text-iron";
  return (
    <div
      className={cn(
        "flex flex-col gap-6 md:flex-row md:items-end md:justify-between",
        align === "center" && "md:flex-col md:items-center md:text-center",
      )}
    >
      <div className={cn("max-w-2xl space-y-3", align === "center" && "mx-auto text-center")}>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h2 className="text-heading md:text-heading-lg">{title}</h2>
        {lead ? <p className={cn("text-lead", muted)}>{lead}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * A label/value row that keeps long values from widening the page.
 *
 * The proof view is mostly made of these, and on a 320px screen a 66-character hex handle will blow
 * out the layout unless it is explicitly allowed to truncate or scroll.
 */
export function DataRow({
  label,
  children,
  hint,
  surface = "dark",
}: {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  surface?: "dark" | "light";
}) {
  const border = surface === "dark" ? "border-white/10" : "border-ash/40";
  const muted = surface === "dark" ? "text-white/60" : "text-iron";
  return (
    <div
      className={cn(
        "flex flex-col gap-1 border-b py-3.5 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6",
        border,
      )}
    >
      <dt className={cn("text-small", muted)}>{label}</dt>
      <dd className="min-w-0 text-small font-medium sm:text-right">
        {children}
        {hint ? <p className={cn("mt-0.5 text-caption font-normal", muted)}>{hint}</p> : null}
      </dd>
    </div>
  );
}

/** Status pill that never relies on colour alone — the glyph and the word carry the meaning too. */
export function StatusPill({
  state,
  children,
}: {
  state: "encrypted" | "verified" | "pending" | "public" | "failed";
  children: ReactNode;
}) {
  const config = {
    encrypted: { className: "bg-violet/15 text-violet", glyph: "◆" },
    verified: { className: "bg-white/10 text-white", glyph: "✓" },
    pending: { className: "bg-white/[0.06] text-white/70", glyph: "○" },
    public: { className: "bg-white/10 text-white/85", glyph: "◇" },
    failed: { className: "bg-white/10 text-white", glyph: "!" },
  } as const;
  const { className, glyph } = config[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-badge px-2 py-0.5 text-caption font-medium",
        className,
      )}
    >
      <span aria-hidden="true">{glyph}</span>
      {children}
    </span>
  );
}

export function Divider({ surface = "dark" }: { surface?: "dark" | "light" }) {
  return (
    <hr className={cn("border-t", surface === "dark" ? "border-white/10" : "border-ash/40")} />
  );
}
