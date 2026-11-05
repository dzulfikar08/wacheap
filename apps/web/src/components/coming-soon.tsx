import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@wacheap/ui/components/empty";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { PageHeader } from "./page-header";

/** A page whose feature isn't built yet: the header plus one line on what it will do. */
export function ComingSoon(props: {
  title: string;
  description: string;
  icon: LucideIcon;
  /** What the page will let the seller do, in one sentence. */
  plan: string;
  children?: ReactNode;
}) {
  const Icon = props.icon;
  return (
    <>
      <PageHeader title={props.title} description={props.description} />
      <Empty className="border border-border bg-card/60">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon />
          </EmptyMedia>
          <EmptyTitle>{props.title} sedang dibangun</EmptyTitle>
          <EmptyDescription>{props.plan}</EmptyDescription>
        </EmptyHeader>
        {props.children ? <EmptyContent>{props.children}</EmptyContent> : null}
      </Empty>
    </>
  );
}
