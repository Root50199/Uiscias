import { z } from 'zod';

/**
 * The committed per-modId version ledger (`version-ledger.json` at the repo
 * root): the highest version number ever assigned to each modId across the
 * mod's entire published history.
 *
 * It is durable memory that keeps versions **monotonic**. A mod's version is
 * otherwise derived only from its `build.lock.json` / existing `.it`, so wiping
 * the lock (or the whole `build/` folder) would reset it to 1 and let a new,
 * different build reuse an already-published number — which Findias, comparing
 * installed-vs-catalog versions, cannot then tell apart. The ledger floors every
 * bump so a number is never reused or decreased for a given modId.
 *
 * Keyed by modId; the value is the max version ever used. Never decremented, and
 * entries are never removed (a retired modId keeps its floor so nothing can
 * reclaim its numbers).
 */
export const versionLedgerSchema = z.record(z.string().min(1), z.number().int().positive());

export type VersionLedger = z.infer<typeof versionLedgerSchema>;
