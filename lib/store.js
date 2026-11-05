import { clone, deepFreeze } from "./util.js";
import { mailboxDomainSpec, validatePersistentState } from "./model.js";

/** Serializes every complete snapshot read-modify-write. A write becomes visible only after durability. */
export class MailboxRepository {
  constructor({ domain = null, global, now }) {
    this.domain = domain;
    this.global = global;
    this.now = now;
    this.current = deepFreeze(validatePersistentState(global.get()));
    this.tail = Promise.resolve();
    this.closed = false;
  }

  static async open(storageDomain, now) {
    const domain = await storageDomain.open(mailboxDomainSpec);
    try {
      return new MailboxRepository({ domain, global: domain.global, now });
    } catch (error) {
      await domain.close();
      throw error;
    }
  }

  snapshot() {
    return this.current;
  }

  read(visitor) {
    return visitor(this.current);
  }

  /** The mutator returns { value, commit? }. It must be synchronous and side-effect free outside `next`. */
  transact(mutator) {
    if (this.closed) return Promise.reject(new Error("Mailbox repository is closed"));
    const run = this.tail.then(async () => {
      const base = this.current;
      const next = clone(base);
      const outcome = mutator(next, base);
      if (!outcome || typeof outcome !== "object") throw new TypeError("Mailbox transaction must return an outcome");
      if (outcome.commit === false) return outcome.value;
      validatePersistentState(next);
      await this.global.set(next);
      this.current = deepFreeze(next);
      return outcome.value;
    });
    this.tail = run.then(() => undefined, () => undefined);
    return run;
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    await this.tail;
    await this.domain?.close();
  }
}
