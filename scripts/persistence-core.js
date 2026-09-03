(function persistenceModule(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root, require('node:crypto'));
  else root.DndWorldPersistence = factory(root, null);
})(typeof globalThis !== 'undefined' ? globalThis : this, function persistenceFactory(root, nodeCrypto) {
  'use strict';

  const ENVELOPE_SCHEMA = 'dnd-world-campaign-envelope/1';
  const RECEIPT_SCHEMA = 'dnd-world-persistence-receipt/1';
  const CLOUD_SCHEMA = 'dnd-world-cloud-channel/1';
  const WORLD_SNAPSHOT_SCHEMA = 'dnd-world-world-snapshot/1';

  function fail(message, code) {
    const error = new Error(message); error.code = code || 'PERSISTENCE_ERROR'; throw error;
  }

  function plain(value, seen) {
    if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') { if (!Number.isFinite(value)) fail('Envelope contains a non-finite number.', 'INVALID_VALUE'); return value; }
    if (typeof value === 'bigint') return value.toString();
    if (typeof value !== 'object') fail('Envelope contains an unsupported value.', 'INVALID_VALUE');
    seen = seen || new Set(); if (seen.has(value)) fail('Envelope contains a cycle.', 'CYCLIC_VALUE'); seen.add(value);
    let out;
    if (Array.isArray(value)) out = value.map(row => row === undefined ? null : plain(row, seen));
    else { out = {}; for (const key of Object.keys(value).sort()) if (value[key] !== undefined) out[key] = plain(value[key], seen); }
    seen.delete(value); return out;
  }

  function canonicalJson(value) { return JSON.stringify(plain(value)); }

  async function sha256(text) {
    text = String(text);
    if (nodeCrypto) return nodeCrypto.createHash('sha256').update(text, 'utf8').digest('hex');
    const crypto = root && root.crypto, subtle = crypto && crypto.subtle;
    if (!subtle || typeof TextEncoder === 'undefined') fail('SHA-256 is unavailable.', 'CHECKSUM_UNAVAILABLE');
    const bytes = new TextEncoder().encode(text), digest = await subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function positiveInteger(value, label, allowMinusOne) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < (allowMinusOne ? -1 : 0)) fail(label+' must be a safe integer.', 'INVALID_REVISION');
    return number;
  }

  function envelopeBody(input) {
    const state = input && input.state;
    if (!state || typeof state !== 'object' || Array.isArray(state)) fail('Campaign state must be an object.', 'INVALID_STATE');
    const campaignId = String(input.campaignId || '').trim(), transactionId = String(input.transactionId || '').trim();
    if (!campaignId) fail('campaignId is required.', 'INVALID_CAMPAIGN_ID');
    if (!transactionId || !/^[A-Za-z0-9:._-]+$/.test(transactionId)) fail('transactionId is invalid.', 'INVALID_TRANSACTION_ID');
    const revision = positiveInteger(input.revision, 'revision'), parentRevision = positiveInteger(input.parentRevision, 'parentRevision', true);
    if (revision !== parentRevision + 1 && !(revision === 0 && parentRevision === -1)) fail('revision must follow parentRevision.', 'INVALID_REVISION_CHAIN');
    return plain({
      schemaVersion:ENVELOPE_SCHEMA, campaignId, revision, parentRevision, transactionId,
      rulesetRefs:Array.isArray(input.rulesetRefs) ? input.rulesetRefs : [], catalogRefs:Array.isArray(input.catalogRefs) ? input.catalogRefs : [],
      state, writtenAt:String(input.writtenAt || new Date().toISOString())
    });
  }

  async function createEnvelope(input) {
    const body = envelopeBody(input), checksum = await sha256(canonicalJson(body));
    return Object.freeze(Object.assign({}, body, {checksum}));
  }

  async function verifyEnvelope(value) {
    if (!value || value.schemaVersion !== ENVELOPE_SCHEMA) return {ok:false, code:'UNSUPPORTED_SCHEMA', reason:'Expected '+ENVELOPE_SCHEMA+'.'};
    let body;
    try { body = envelopeBody(value); }
    catch (error) { return {ok:false, code:error.code || 'INVALID_ENVELOPE', reason:String(error.message || error)}; }
    const expected = await sha256(canonicalJson(body)), actual = String(value.checksum || '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(actual) || actual !== expected) return {ok:false, code:'CHECKSUM_MISMATCH', reason:'Campaign checksum does not match its state.', expected, actual};
    return {ok:true, envelope:Object.freeze(Object.assign({}, body, {checksum:actual}))};
  }

  async function migrateWorldSnapshot(snapshot, options) {
    options = options || {};
    if (!snapshot || snapshot.schemaVersion !== WORLD_SNAPSHOT_SCHEMA) fail('Only world-snapshot/1 can be migrated.', 'UNSUPPORTED_SCHEMA');
    const revision = Math.max(0, Number.isSafeInteger(snapshot.snapshotRevision) ? snapshot.snapshotRevision : 0);
    return createEnvelope({
      campaignId:options.campaignId || 'default', revision, parentRevision:revision - 1,
      transactionId:options.transactionId || 'migrate-world-snapshot-v1', rulesetRefs:options.rulesetRefs || [],
      catalogRefs:Array.isArray(snapshot.catalogRefs) ? snapshot.catalogRefs : [], state:snapshot,
      writtenAt:options.writtenAt || new Date().toISOString()
    });
  }

  function parseStored(raw) {
    if (raw == null || raw === '') return {ok:true, missing:true, raw:null, value:null};
    if (typeof raw === 'object') return {ok:true, missing:false, raw:canonicalJson(raw), value:raw};
    try { return {ok:true, missing:false, raw:String(raw), value:JSON.parse(raw)}; }
    catch (error) { return {ok:false, code:'CORRUPT_JSON', reason:String(error && error.message || error), raw:String(raw)}; }
  }

  async function selectFreshestEnvelope(candidates) {
    const verified = [], failures = [], present = [];
    for (const candidate of Array.isArray(candidates) ? candidates : []) {
      const tier = String(candidate && candidate.tier || 'unknown'), parsed = parseStored(candidate && candidate.raw);
      if (parsed.missing) continue;
      present.push(tier);
      if (!parsed.ok) { failures.push({tier, code:parsed.code, reason:parsed.reason}); continue; }
      const checked = await verifyEnvelope(parsed.value);
      if (!checked.ok) { failures.push({tier, code:checked.code, reason:checked.reason}); continue; }
      verified.push({tier, raw:parsed.raw, envelope:checked.envelope, revision:checked.envelope.revision, checksum:checked.envelope.checksum});
    }
    if (!present.length) return {ok:true, missing:true, raw:null, envelope:null, revision:-1, tier:null};
    if (!verified.length) return {ok:false, code:'NO_VERIFIED_ENVELOPE', reason:'No durable storage tier contains a verified campaign envelope.', tiers:present, failures};
    const revision = Math.max(...verified.map(row => row.revision)), freshest = verified.filter(row => row.revision === revision);
    const checksums = [...new Set(freshest.map(row => row.checksum))];
    if (checksums.length !== 1) return {
      ok:false, conflict:true, code:'ENVELOPE_TIER_CONFLICT',
      reason:'Durable storage tiers contain conflicting campaign envelopes at revision '+revision+'.',
      revision, tiers:freshest.map(row => row.tier), checksums
    };
    const selected = freshest[0];
    return {ok:true, missing:false, raw:selected.raw, envelope:selected.envelope, revision, checksum:selected.checksum, tier:selected.tier};
  }

  class MemoryAdapter {
    constructor(initial) { this.values = new Map(Object.entries(initial || {})); this.failNextSet = false; this.compareQueue = Promise.resolve(); }
    async get(key) { return this.values.has(key) ? this.values.get(key) : null; }
    async set(key, value) { if (this.failNextSet) { this.failNextSet = false; throw new Error('injected write failure'); } this.values.set(key, String(value)); return true; }
    async compareAndSet(key, expectedRaw, value) {
      const operation = this.compareQueue.then(async () => {
        const current = this.values.has(key) ? this.values.get(key) : null;
        if (current !== expectedRaw) return false;
        await this.set(key, value);
        return true;
      });
      this.compareQueue = operation.catch(() => undefined);
      return operation;
    }
  }

  class EnvelopeRepository {
    constructor(options) {
      options = options || {}; if (!options.adapter || typeof options.adapter.get !== 'function' || typeof options.adapter.set !== 'function') fail('EnvelopeRepository needs a storage adapter.', 'INVALID_ADAPTER');
      this.adapter = options.adapter; this.key = String(options.key || 'dndworld2:campaign-envelope'); this.backupKey = String(options.backupKey || this.key+':backup');
      this.clock = options.clock || (() => new Date().toISOString()); this.idFactory = options.idFactory || (() => 'tx-'+Date.now().toString(36));
    }
    async read() {
      let raw;
      try { raw = await this.adapter.get(this.key); }
      catch (error) { return {ok:false, code:error && error.code || 'READ_FAILED', reason:String(error && error.message || error)}; }
      const parsed = parseStored(raw);
      if (!parsed.ok) return parsed; if (parsed.missing) return {ok:true, missing:true, revision:-1, envelope:null};
      const verified = await verifyEnvelope(parsed.value); return verified.ok ? {ok:true, missing:false, revision:verified.envelope.revision, envelope:verified.envelope, raw:parsed.raw} : verified;
    }
    async commit(options) {
      options = options || {}; const current = await this.read(); if (!current.ok) return current;
      const expectedRevision = positiveInteger(options.expectedRevision == null ? -1 : options.expectedRevision, 'expectedRevision', true);
      if (current.revision !== expectedRevision) return {ok:false, conflict:true, code:'REVISION_CONFLICT', reason:'Campaign revision changed.', expectedRevision, actualRevision:current.revision};
      const transactionId = String(options.transactionId || this.idFactory()), envelope = await createEnvelope({
        campaignId:options.campaignId, revision:current.revision + 1, parentRevision:current.revision, transactionId,
        rulesetRefs:options.rulesetRefs, catalogRefs:options.catalogRefs, state:options.state, writtenAt:options.writtenAt || this.clock()
      });
      try {
        if (current.raw != null) await this.adapter.set(this.backupKey, current.raw);
        const encoded = canonicalJson(envelope);
        if (typeof this.adapter.compareAndSet === 'function') {
          const committed = await this.adapter.compareAndSet(this.key, current.raw == null ? null : current.raw, encoded);
          if (!committed) {
            const latest = await this.read();
            return {ok:false, conflict:true, code:'REVISION_CONFLICT', reason:'Campaign revision changed during commit.', expectedRevision, actualRevision:latest.ok ? latest.revision : null};
          }
        } else await this.adapter.set(this.key, encoded);
      } catch (error) { return {ok:false, code:'WRITE_FAILED', reason:String(error && error.message || error), expectedRevision}; }
      const readBack = await this.read();
      if (!readBack.ok || readBack.revision !== envelope.revision || readBack.envelope.checksum !== envelope.checksum) return {ok:false, code:'READ_BACK_FAILED', reason:'Campaign envelope could not be verified after write.', expectedRevision};
      return {ok:true, envelope:readBack.envelope, receipt:Object.freeze({schemaVersion:RECEIPT_SCHEMA, status:'committed', campaignId:envelope.campaignId, transactionId, parentRevision:envelope.parentRevision, revision:envelope.revision, checksum:envelope.checksum, writtenAt:envelope.writtenAt})};
    }
    async installMigrated(envelope, sourceRaw) {
      const verified = await verifyEnvelope(envelope); if (!verified.ok) return verified;
      const current = await this.read(); if (!current.ok || !current.missing) return current.ok ? {ok:false, code:'ENVELOPE_EXISTS', reason:'A campaign envelope already exists.'} : current;
      try { if (sourceRaw != null) await this.adapter.set(this.backupKey, String(sourceRaw)); await this.adapter.set(this.key, canonicalJson(verified.envelope)); }
      catch (error) { return {ok:false, code:'WRITE_FAILED', reason:String(error && error.message || error)}; }
      const readBack = await this.read(); return readBack.ok ? {ok:true, envelope:readBack.envelope, migrated:true} : readBack;
    }
  }

  function cloudRevision(message) { return message && message.schemaVersion === CLOUD_SCHEMA && Number.isSafeInteger(message.revision) ? message.revision : 0; }

  function cloudCasPlan(remoteMessage, dirtyParentRevision) {
    const remoteRevision = cloudRevision(remoteMessage), parent = positiveInteger(dirtyParentRevision, 'dirtyParentRevision', true);
    if (remoteRevision !== parent) return {ok:false, conflict:true, code:'CLOUD_REVISION_CONFLICT', expectedRevision:parent, actualRevision:remoteRevision};
    return {ok:true, parentRevision:remoteRevision, revision:remoteRevision + 1};
  }

  function createCloudMessage(payload, options) {
    options = options || {}; const parentRevision = positiveInteger(options.parentRevision, 'parentRevision', true), revision = parentRevision + 1;
    const by = String(options.by || '').trim(), transactionId = String(options.transactionId || '').trim(); if (!by || !transactionId) fail('Cloud message identity is required.', 'INVALID_CLOUD_MESSAGE');
    return plain({schemaVersion:CLOUD_SCHEMA, by, at:Number(options.at || Date.now()), revision, parentRevision, transactionId, payload});
  }

  return Object.freeze({
    ENVELOPE_SCHEMA,RECEIPT_SCHEMA,CLOUD_SCHEMA,WORLD_SNAPSHOT_SCHEMA,canonicalJson,sha256,createEnvelope,verifyEnvelope,migrateWorldSnapshot,
    parseStored,selectFreshestEnvelope,MemoryAdapter,EnvelopeRepository,cloudRevision,cloudCasPlan,createCloudMessage
  });
});
