import type { Session } from "@wab/auth";
import type { Database } from "@wab/db";

export type Context = {
  session: Session | null;
  db: Database;
};
