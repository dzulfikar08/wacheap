import type { Session } from "@wacheap/auth";
import type { Database } from "@wacheap/db";

export type Context = {
  session: Session | null;
  db: Database;
};
