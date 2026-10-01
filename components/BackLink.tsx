import Link from "next/link";
import { Icon } from "./Icon";

export function BackLink({ href = "/", label = "Home" }: { href?: string; label?: string }) {
  return (
    <Link href={href} className="-ml-2 inline-flex h-12 items-center gap-1 pr-3 pl-1 text-[17px] font-semibold">
      <Icon name="back" />
      {label}
    </Link>
  );
}
