import { randomUUID } from "node:crypto";
import { getModel } from "../models/base.js";

/**
 * Background jobs of the API process (telematics, website pull, messaging,
 * RingCentral renewal). Each job:
 *   • never overlaps itself: the next run is scheduled when the last one ends;
 *   • runs on one instance at a time: a lease row in `job_runs`, claimed with a
 *     single atomic upsert, so two API processes (as during a release switch)
 *     never both send the lead follow-up texts or a scheduled broadcast;
 *   • retries a failed run with backoff (30 s, doubling, capped at an hour or the
 *     job's interval) instead of waiting a full interval;
 *   • records when it last started, succeeded and failed, so /ready can tell
 *     when a job has stopped working.
 */

export interface JobSpec {
  name: string;
  /** Pause between the end of one run and the start of the next. */
  everyMs: number;
  run: () => Promise<void>;
  /** First run right away instead of after one interval. */
  runAtStart?: boolean;
  /** How long a claim holds; an instance that dies mid-run frees it after this. */
  leaseMs?: number;
}

export type JobState = "ok" | "failing" | "stale" | "pending";

interface JobRow {
  id: string;
  leaseUntil?: string;
  leaseOwner?: string;
  lastStartedAt?: string;
  lastOkAt?: string;
  lastErrorAt?: string;
  lastError?: string;
  failures?: number;
}

const RETRY_BASE_MS = 30_000;
const RETRY_CAP_MS = 60 * 60_000;
const DUPLICATE_KEY = 11000;

export function createJobRunner(opts: { owner?: string; collection?: string; log?: (msg: string) => void } = {}) {
  const owner = opts.owner ?? `${process.pid}-${randomUUID().slice(0, 8)}`;
  const model = () => getModel(opts.collection ?? "job_runs");
  const log = opts.log ?? ((msg: string) => console.warn(msg));
  const jobs = new Map<string, { spec: JobSpec; timer: NodeJS.Timeout | null; failures: number; startedAt: number }>();
  let stopped = false;

  /** Claim `name` for this instance; false when another instance holds it. */
  async function claim(name: string, leaseMs: number): Promise<boolean> {
    const now = new Date();
    const iso = now.toISOString();
    try {
      // A row with a live lease held by someone else does not match, so the
      // upsert tries to insert a second row with the same id and the unique
      // index refuses it: exactly one claimant wins.
      const row = await model()
        .findOneAndUpdate(
          { id: name, $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: null }, { leaseUntil: { $lt: iso } }, { leaseOwner: owner }] },
          {
            $set: { leaseUntil: new Date(now.getTime() + leaseMs).toISOString(), leaseOwner: owner, lastStartedAt: iso, updatedAt: iso },
            $setOnInsert: { createdAt: iso },
          },
          { upsert: true, new: true },
        )
        .lean<JobRow>();
      return row?.leaseOwner === owner;
    } catch (err) {
      if ((err as { code?: number }).code === DUPLICATE_KEY) return false;
      throw err;
    }
  }

  async function finish(name: string, error: unknown): Promise<void> {
    const iso = new Date().toISOString();
    const set: Record<string, unknown> = { leaseUntil: iso, updatedAt: iso };
    if (error === undefined) Object.assign(set, { lastOkAt: iso, failures: 0 });
    else Object.assign(set, { lastErrorAt: iso, lastError: String((error as Error)?.message ?? error).slice(0, 300) });
    await model().updateOne({ id: name, leaseOwner: owner }, { $set: set, ...(error !== undefined && { $inc: { failures: 1 } }) });
  }

  function schedule(name: string, delayMs: number): void {
    const job = jobs.get(name);
    if (!job || stopped) return;
    job.timer = setTimeout(() => void tick(name), delayMs);
    job.timer.unref?.(); // never keeps the process alive on its own
  }

  async function tick(name: string): Promise<void> {
    const job = jobs.get(name);
    if (!job || stopped) return;
    const { spec } = job;
    let delay = spec.everyMs;
    try {
      if (await claim(name, spec.leaseMs ?? Math.max(2 * spec.everyMs, 60_000))) {
        let error: unknown;
        try {
          await spec.run();
          job.failures = 0;
        } catch (err) {
          error = err ?? new Error("job failed");
          job.failures += 1;
          delay = Math.min(spec.everyMs, RETRY_CAP_MS, RETRY_BASE_MS * 2 ** (job.failures - 1));
          log(`job ${name} failed (${job.failures} in a row), retrying in ${Math.round(delay / 1000)}s: ${(err as Error)?.message ?? err}`);
        }
        await finish(name, error);
      }
    } catch (err) {
      // The job table itself is unreachable (database down): try again later.
      log(`job ${name} could not be scheduled: ${(err as Error)?.message ?? err}`);
      delay = Math.min(spec.everyMs, RETRY_BASE_MS);
    }
    schedule(name, delay);
  }

  return {
    owner,
    /** Start a job; starting a name twice is a no-op. */
    start(spec: JobSpec): void {
      if (jobs.has(spec.name) || stopped) return;
      jobs.set(spec.name, { spec, timer: null, failures: 0, startedAt: Date.now() });
      schedule(spec.name, spec.runAtStart ? 0 : spec.everyMs);
    },
    /** Stop scheduling and hand back any lease this instance holds. */
    async stop(): Promise<void> {
      stopped = true;
      for (const job of jobs.values()) if (job.timer) clearTimeout(job.timer);
      const iso = new Date().toISOString();
      await model()
        .updateMany({ leaseOwner: owner, leaseUntil: { $gt: iso } }, { $set: { leaseUntil: iso, updatedAt: iso } })
        .catch(() => undefined);
    },
    /**
     * Per job: "ok" (last run succeeded), "failing" (last run failed),
     * "stale" (nothing succeeded for three intervals) or "pending" (not run yet).
     */
    async health(now = Date.now()): Promise<Record<string, JobState>> {
      const rows = await model()
        .find({ id: { $in: [...jobs.keys()] } })
        .lean<JobRow[]>();
      const byId = new Map(rows.map((r) => [r.id, r]));
      const out: Record<string, JobState> = {};
      for (const [name, job] of jobs) {
        const row = byId.get(name);
        const lastOk = row?.lastOkAt ? Date.parse(row.lastOkAt) : NaN;
        const since = Number.isNaN(lastOk) ? job.startedAt : lastOk;
        const lastErr = row?.lastErrorAt ? Date.parse(row.lastErrorAt) : NaN;
        if (now - since > 3 * job.spec.everyMs + 60_000) out[name] = "stale";
        else if (!Number.isNaN(lastErr) && (Number.isNaN(lastOk) || lastErr > lastOk)) out[name] = "failing";
        else out[name] = Number.isNaN(lastOk) ? "pending" : "ok";
      }
      return out;
    },
  };
}

export type JobRunner = ReturnType<typeof createJobRunner>;

/** The API process's runner. */
export const jobs = createJobRunner();
