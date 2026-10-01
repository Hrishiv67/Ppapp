import Link from "next/link";
import type { ReactNode } from "react";

type Variant = "primary" | "secondary" | "quiet";

const STYLES: Record<Variant, string> = {
  primary: "h-[76px] bg-inverse-bg text-inverse-ink text-[22px] font-semibold",
  secondary: "h-14 border-[1.5px] border-line text-ink text-[17px] font-semibold",
  quiet: "h-12 text-ink text-[17px] font-semibold underline-offset-4 hover:underline",
};

interface Props {
  variant?: Variant;
  href?: string;
  onClick?: () => void;
  children: ReactNode;
  /** Primary actions that start play carry the ball. */
  ball?: boolean;
  disabled?: boolean;
}

export function Button({ variant = "primary", href, onClick, children, ball, disabled }: Props) {
  const cls = `flex w-full items-center justify-center gap-3.5 rounded-[var(--radius-control)] transition-transform active:scale-[0.985] disabled:opacity-50 ${STYLES[variant]}`;
  const inner = (
    <>
      {ball && <span className="size-3.5 rounded-full bg-ball" aria-hidden="true" />}
      {children}
    </>
  );
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  return (
    <button type="button" onClick={onClick} className={cls} disabled={disabled}>
      {inner}
    </button>
  );
}
