/**
 * Unit ledger: the shared spend and each visitor's daily count, in one Durable Object.
 *
 * KV has no atomic increment, so two results landing together could each read the
 * same total and one update was lost. A single Durable Object handles one request
 * at a time, so the budget check and the reservation happen as one step.
 */
import { DurableObject } from "cloudflare:workers";

type Reservation = { ok: true; spent: number; used: number } | { ok: false; reason: "budget" | "visitor" };

export class Ledger extends DurableObject<{ CACHE: KVNamespace }> {
  constructor(ctx: DurableObjectState, env: { CACHE: KVNamespace }) {
    super(ctx, env);
    // First run only: carry over the total the KV counter had reached.
    ctx.blockConcurrencyWhile(async () => {
      if ((await ctx.storage.get<number>("units")) === undefined) {
        await ctx.storage.put("units", parseInt((await env.CACHE.get("units:spent")) || "0", 10) || 0);
      }
    });
  }

  async status(visitor: string) {
    return {
      spent: (await this.ctx.storage.get<number>("units")) ?? 0,
      used: (await this.ctx.storage.get<number>(visitor)) ?? 0,
    };
  }

  /** Check the budget and the visitor's daily cap, then reserve, with nothing in between. */
  async reserve(visitor: string, units: number, budget: number, perVisitor: number): Promise<Reservation> {
    const spent = (await this.ctx.storage.get<number>("units")) ?? 0;
    const used = await this.ctx.storage.get<number>(visitor);
    if (spent + units > budget) return { ok: false, reason: "budget" };
    if ((used ?? 0) >= perVisitor) return { ok: false, reason: "visitor" };
    if (used === undefined) await this.pruneOtherDays(visitor);
    await this.ctx.storage.put({ units: spent + units, [visitor]: (used ?? 0) + 1 });
    return { ok: true, spent: spent + units, used: (used ?? 0) + 1 };
  }

  /** Give units back (YouCam doesn't charge failures). With a visitor, the photo slot comes back too. */
  async release(units: number, visitor?: string) {
    const spent = (await this.ctx.storage.get<number>("units")) ?? 0;
    await this.ctx.storage.put("units", Math.max(0, spent - units));
    if (visitor) {
      const used = (await this.ctx.storage.get<number>(visitor)) ?? 0;
      await this.ctx.storage.put(visitor, Math.max(0, used - 1));
    }
  }

  /** Visitor keys are per day (v:YYYY-MM-DD:hash); drop earlier days when a new one starts. */
  private async pruneOtherDays(visitor: string) {
    const day = visitor.slice(0, 13);
    const old = [...(await this.ctx.storage.list({ prefix: "v:" })).keys()].filter((k) => !k.startsWith(day));
    if (old.length) await this.ctx.storage.delete(old.slice(0, 128));
  }
}
