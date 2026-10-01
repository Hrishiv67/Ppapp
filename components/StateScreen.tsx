import type { ReactNode } from "react";
import { BackLink } from "./BackLink";
import { Icon, type IconName } from "./Icon";

/** The full-screen pattern for permission and error states: icon, one line, one action. */
export function StateScreen({ icon, title, children, actions }: { icon: IconName; title: string; children?: ReactNode; actions: ReactNode }) {
  return (
    <main className="screen">
      <BackLink />
      <div className="mt-14">
        <Icon name={icon} size={56} />
        <h1 className="mt-6 text-[32px] leading-[1.15] font-semibold">{title}</h1>
        <div className="mt-4 text-[19px] text-ink-muted">{children}</div>
      </div>
      <div className="flex-1" />
      <div className="flex flex-col gap-2">{actions}</div>
    </main>
  );
}
