import { describe, expect, test } from "bun:test";

import { user } from "@wab/db/schema/auth";
import { d1TestDb } from "@wab/db/test-d1";

import { chunk, D1_MAX_PARAMS, insertChunked, readChunked, rowsPerStatement } from "./d1";

describe("chunk", () => {
  test("splits in order and keeps the tail", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  test("refuses a size below 1", () => {
    expect(() => chunk([1], 0)).toThrow();
  });
});

describe("readChunked", () => {
  test("never hands a slice larger than the free parameters", async () => {
    const keys = Array.from({ length: 250 }, (_, i) => i);
    const sizes: number[] = [];
    const out = await readChunked(keys, async (slice) => (sizes.push(slice.length), slice), {
      reserved: 4,
    });
    expect(out).toEqual(keys);
    expect(Math.max(...sizes)).toBe(D1_MAX_PARAMS - 4);
  });
});

describe("insertChunked on the D1-guarded database", () => {
  test("inserts more rows than one statement can bind", async () => {
    const { db, client } = await d1TestDb();
    const rows = Array.from({ length: rowsPerStatement(user) * 3 + 1 }, (_, i) => ({
      id: `u${i}`,
      name: `User ${i}`,
      email: `u${i}@example.test`,
    }));
    await insertChunked(db, user, rows);
    const count = await client.execute("select count(*) as n from user");
    expect(Number(count.rows[0]!.n)).toBe(rows.length);
  });

  test("the guard throws what D1 throws for an oversized statement", async () => {
    const { client } = await d1TestDb();
    const args = Array.from({ length: D1_MAX_PARAMS + 1 }, (_, i) => i);
    await expect(
      client.execute({ sql: `select ${args.map(() => "?").join(",")}`, args }),
    ).rejects.toThrow(/too many SQL variables/);
  });
});
