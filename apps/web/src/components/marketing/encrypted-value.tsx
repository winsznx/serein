import { cn } from "@/components/ui";

/**
 * The dot-value treatment used across the marketing page's illustrative product surfaces.
 *
 * Never fed a real balance — the landing never reads chain state — but built from the same visual
 * grammar as `.ciphertext` in the live app, so a reader who later sees their real balance in this
 * shape already knows what it means.
 */
export function EncryptedValue({
  size = "body",
  chip = false,
  className,
}: {
  size?: "body" | "heading";
  chip?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className={cn(
          "ciphertext font-medium",
          size === "heading" ? "text-heading-lg" : "text-body",
        )}
      >
        ••••••
      </span>
      {chip ? (
        <span className="inline-flex items-center gap-1 rounded-badge bg-violet/15 px-2 py-0.5 text-caption font-medium text-violet">
          <span aria-hidden="true">◆</span>Encrypted
        </span>
      ) : null}
    </span>
  );
}
