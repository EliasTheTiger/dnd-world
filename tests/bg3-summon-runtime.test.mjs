import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import {TextEncoder} from 'node:util';
import {fileURLToPath} from 'node:url';
import {selectBg3Catalog} from './bg3-catalog-selection.mjs';

/*
 * Exact active-v8 certificate for the first bounded BG3 Summon runtime slice.
 *
 * Three populations must remain separate:
 *
 *   1. every catalog rule program that happens to contain a Summon opcode;
 *   2. the 20 fully typed A12/A32 item action/profile carriers considered by
 *      the private ground-placement runtime (18 exact allows, two Scry denies);
 *   3. the 10 ready A33 learning routes.  A33 learning records provenance and
 *      spends its own resources; it must never summon anything at learn time.
 *
 * This file is both a structural source certificate and a causal runtime
 * certificate.  Public CanStand evaluation remains fail-closed; only the
 * private item route may bind an exact position and same-template attestation.
 */

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const selected = selectBg3Catalog(repo);
const {current, manifest, catalogRoot} = selected;
const jsonCache = new Map();

const REQUIRED_ROLES = Object.freeze([
  'activation-guard',
  'target-guard',
  'resolution',
  'consequences',
  'success-consequences',
  'failure-consequences',
  'resource-cost',
]);

const EXPECTED = Object.freeze({
  version: 'bg3-24532579-v8',
  summonProgramProfiles: 144,
  summonRules: 72,
  summonOpcodeOccurrences: 158,
  itemCarriers: 34,
  typedCarriers: 20,
  mixedCarriers: 14,
  canStandCarriers: 12,
  matchingCanStandCarriers: 10,
  scryMismatchCarriers: 2,
  physicalTypedA33: 12,
  readyTypedA33: 10,
  readyItemOnSpellCastInterrupts: 0,
  readyTypedA33Sha256: 'b946b810b419d88b4dae6b8a48cd401a1ff3f5c21ab20bd09a52bf55e29043e1',
});

const uuid = value => ({kind: 'string', value, format: 'uuid'});
const string = value => ({kind: 'string', value});
const symbol = value => ({kind: 'symbol', value});
const integer = value => ({kind: 'integer', value});
const empty = () => ({kind: 'empty'});

const TYPED_SOURCES = Object.freeze([
  {
    spellId: 'Projectile_ALCH_Solution_Grenade_Light',
    ruleId: 'bg3:rule:spell:UHJvamVjdGlsZV9BTENIX1NvbHV0aW9uX0dyZW5hZGVfTGlnaHQ',
    itemId: 'bg3:item:rt:c3236e6e-21e4-4e39-a5b4-fda105d8ce3f:stats:QUxDSF9Tb2x1dGlvbl9HcmVuYWRlX0xpZ2h0',
    statsId: 'ALCH_Solution_Grenade_Light',
    itemShard: 'items/9a-0001.json',
    rootArtifact: 'root-template-programs/9a-0000.json',
    ruleArtifact: 'rules/spells/e2.json',
    context: 'throw',
    target: 'any',
    actionType: 32,
    consume: ['item', 1],
    useIds: {standard: 'bg3-use-e72d042cef60ac308df7', honour: 'bg3-use-b5ac72f8e2c756d017f8'},
    args: [uuid('2064328c-a090-454f-b3b8-b488bbe64567'), integer(10), empty(), empty(), empty(), symbol('DANCING_LIGHTS')],
    scope: 'GROUND',
    raw: 'GROUND:Summon(2064328c-a090-454f-b3b8-b488bbe64567, 10,,,,DANCING_LIGHTS)',
    spellFlags: 'DisplayInItemTooltip',
    concentration: false,
    canStand: null,
    fieldOpcodeCount: 1,
    summonOccurrences: 1,
  },
  {
    spellId: 'Target_ArcaneEye',
    ruleId: 'bg3:rule:spell:VGFyZ2V0X0FyY2FuZUV5ZQ',
    itemId: 'bg3:item:rt:5314d1eb-5771-47b5-80a7-2ee093ef4618:stats:T0JKX1Njcm9sbF9BcmNhbmVFeWU',
    statsId: 'OBJ_Scroll_ArcaneEye',
    itemShard: 'items/3d-0000.json',
    rootArtifact: 'root-template-programs/3d-0000.json',
    ruleArtifact: 'rules/spells/cb.json',
    context: 'scroll',
    target: 'any',
    actionType: 12,
    consume: ['item', 1],
    useIds: {standard: 'bg3-use-8ea7685f24577f6be1cd', honour: 'bg3-use-04c63e170326b7488834'},
    a33UseIds: {standard: 'bg3-use-b2d1041ffa9e43001ad8', honour: 'bg3-use-c5c6466aa14e4ad2df5e'},
    args: [uuid('2f83206a-13c3-4ecb-a599-f6aa4708e149'), integer(100), empty(), empty(), empty(), symbol('UNSUMMON_ABLE')],
    scope: 'GROUND',
    raw: "GROUND:Summon(2f83206a-13c3-4ecb-a599-f6aa4708e149, 100,,,,UNSUMMON_ABLE)",
    spellFlags: 'HasVerbalComponent;HasSomaticComponent;IsConcentration;IsSpell;CannotTargetCharacter;CannotTargetItems',
    concentration: true,
    canStand: '2f83206a-13c3-4ecb-a599-f6aa4708e149',
    fieldOpcodeCount: 1,
    summonOccurrences: 1,
  },
  {
    spellId: 'Target_CloudOfDaggers',
    ruleId: 'bg3:rule:spell:VGFyZ2V0X0Nsb3VkT2ZEYWdnZXJz',
    itemId: 'bg3:item:rt:33421d4f-1cac-4196-a85e-0b07bcb3ecf2:stats:T0JKX1Njcm9sbF9DbG91ZE9mRGFnZ2Vycw',
    statsId: 'OBJ_Scroll_CloudOfDaggers',
    itemShard: 'items/cf-0000.json',
    rootArtifact: 'root-template-programs/cf-0000.json',
    ruleArtifact: 'rules/spells/6a.json',
    context: 'scroll',
    target: 'any',
    actionType: 12,
    consume: ['item', 1],
    useIds: {standard: 'bg3-use-696f820ac57f5662d264', honour: 'bg3-use-cc644890376cc08c7f1d'},
    blockedA33UseIds: {standard: 'bg3-use-18e02dc9e4f43fa2ad22', honour: 'bg3-use-a290b6a66243c422a658'},
    args: [uuid('0ba4af65-19d0-4a31-9a42-2c365462841b'), integer(10), empty(), empty(), empty(), symbol('CLOUD_OF_DAGGERS_AURA')],
    scope: 'AI_IGNORE',
    raw: 'AI_IGNORE:GROUND:Summon(0ba4af65-19d0-4a31-9a42-2c365462841b, 10,,,,CLOUD_OF_DAGGERS_AURA);AI_ONLY:DealDamage(4d4,Slashing)',
    spellFlags: 'IsSpell;HasVerbalComponent;HasSomaticComponent;HasHighGroundRangeExtension;IsConcentration;IsHarmful;CannotTargetItems',
    concentration: true,
    canStand: null,
    fieldOpcodeCount: 2,
    summonOccurrences: 1,
  },
  {
    spellId: 'Target_ConjureIntellectDevour',
    ruleId: 'bg3:rule:spell:VGFyZ2V0X0Nvbmp1cmVJbnRlbGxlY3REZXZvdXI',
    itemId: 'bg3:item:rt:dbc5b484-26d6-41f3-bd50-dc74b8f9cc9b:stats:T0JKX0dlbmVyaWNMb290SXRlbQ',
    statsId: 'OBJ_GenericLootItem',
    itemShard: 'items/05-0001.json',
    rootArtifact: 'root-template-programs/05-0001.json',
    ruleArtifact: 'rules/spells/7a.json',
    context: 'generic',
    target: 'creature',
    actionType: 12,
    consume: ['none', 0],
    useIds: {standard: 'bg3-use-2caa9baa0597a0ef5284', honour: 'bg3-use-e6d887f952d5b0bda9e2'},
    args: [uuid('27b9089b-9aef-44e9-aaf7-100e3e320823'), integer(-1), empty(), empty(), string('IntellectDevourStack'), symbol('UNSUMMON_ABLE'), symbol('SHADOWCURSE_SUMMON_CHECK')],
    scope: 'GROUND',
    raw: "GROUND:Summon(27b9089b-9aef-44e9-aaf7-100e3e320823, -1,,,'IntellectDevourStack',UNSUMMON_ABLE,SHADOWCURSE_SUMMON_CHECK)",
    spellFlags: 'HasVerbalComponent;HasSomaticComponent;IsSpell;CannotTargetItems;CannotTargetCharacter',
    concentration: false,
    canStand: '27b9089b-9aef-44e9-aaf7-100e3e320823',
    fieldOpcodeCount: 1,
    summonOccurrences: 1,
  },
  {
    spellId: 'Target_CursedTome_Seelie_Summon',
    ruleId: 'bg3:rule:spell:VGFyZ2V0X0N1cnNlZFRvbWVfU2VlbGllX1N1bW1vbg',
    itemId: 'bg3:item:rt:b627f83f-8533-4440-95a0-ad2f319fe4ed:stats:VU5JX0xPV19CZXN0aWFsQ29tbXVuaW9uU2Nyb2xs',
    statsId: 'UNI_LOW_BestialCommunionScroll',
    itemShard: 'items/c1-0000.json',
    rootArtifact: 'root-template-programs/c1-0000.json',
    ruleArtifact: 'rules/spells/23.json',
    context: 'generic',
    target: 'creature',
    actionType: 12,
    consume: ['item', 1],
    useIds: {standard: 'bg3-use-9da3a81385228acddb86', honour: 'bg3-use-fe1b6d066c369fcbfc3f'},
    a33UseIds: {standard: 'bg3-use-28a571b44b6b61454de8', honour: 'bg3-use-d199a2a2201c9d866000'},
    args: [uuid('2337e270-3c93-4088-8439-7c7450b99179'), integer(-1), symbol('Projectile_AiHelper_Summon_Strong'), empty(), string('PlanarAllyStack'), symbol('UNSUMMON_ABLE'), symbol('SHADOWCURSE_SUMMON_CHECK')],
    scope: 'AI_IGNORE',
    raw: "AI_IGNORE:Ground:Summon(2337e270-3c93-4088-8439-7c7450b99179, -1,Projectile_AiHelper_Summon_Strong,,'PlanarAllyStack',UNSUMMON_ABLE,SHADOWCURSE_SUMMON_CHECK);AI_ONLY:Ground:Summon(2337e270-3c93-4088-8439-7c7450b99179, -1,Projectile_AiHelper_Summon_Strong,,'PlanarAllyStack',UNSUMMON_ABLE,SHADOWCURSE_SUMMON_CHECK,KNOCKED_OUT_SUMMON_DISMISS)",
    spellFlags: 'HasVerbalComponent;HasSomaticComponent;IsSpell;CannotTargetItems;CannotTargetCharacter',
    concentration: false,
    canStand: '2337e270-3c93-4088-8439-7c7450b99179',
    fieldOpcodeCount: 2,
    summonOccurrences: 2,
  },
  {
    spellId: 'Target_FlamingSphere',
    ruleId: 'bg3:rule:spell:VGFyZ2V0X0ZsYW1pbmdTcGhlcmU',
    itemId: 'bg3:item:rt:0922de82-149f-4cac-aa98-e26222fd7714:stats:T0JKX1Njcm9sbF9GbGFtaW5nU3BoZXJl',
    statsId: 'OBJ_Scroll_FlamingSphere',
    itemShard: 'items/4c-0000.json',
    rootArtifact: 'root-template-programs/4c-0000.json',
    ruleArtifact: 'rules/spells/5d.json',
    context: 'scroll',
    target: 'creature',
    actionType: 12,
    consume: ['item', 1],
    useIds: {standard: 'bg3-use-6fd8f5d0bcdf585ce0c4', honour: 'bg3-use-37e9506b8ba8c688d5db'},
    a33UseIds: {standard: 'bg3-use-7f0603ab1ab9cc1f9a63', honour: 'bg3-use-cfd2b281c1a114b6aabb'},
    args: [uuid('a4ca1c8f-d59b-4393-9c06-987713f8f74d'), integer(10), symbol('Projectile_AiHelper_Summon_Weak'), empty(), empty(), symbol('UNSUMMON_ABLE'), symbol('FLAMING_SPHERE_TECHNICAL'), symbol('SHADOWCURSE_SUMMON_CHECK')],
    scope: 'GROUND',
    raw: 'GROUND:Summon(a4ca1c8f-d59b-4393-9c06-987713f8f74d, 10,Projectile_AiHelper_Summon_Weak,,,UNSUMMON_ABLE,FLAMING_SPHERE_TECHNICAL,SHADOWCURSE_SUMMON_CHECK);',
    spellFlags: 'IsSpell;HasVerbalComponent;HasSomaticComponent;HasHighGroundRangeExtension;CannotTargetCharacter;CannotTargetItems;IsConcentration',
    concentration: true,
    canStand: 'a4ca1c8f-d59b-4393-9c06-987713f8f74d',
    fieldOpcodeCount: 1,
    summonOccurrences: 1,
  },
  {
    spellId: 'Target_GlobeOfInvulnerability',
    ruleId: 'bg3:rule:spell:VGFyZ2V0X0dsb2JlT2ZJbnZ1bG5lcmFiaWxpdHk',
    itemId: 'bg3:item:rt:8d4c06d1-e504-49b0-a4fa-5179ab717f1e:stats:T0JKX1Njcm9sbF9HbG9iZU9mSW52dWxuZXJhYmlsaXR5',
    statsId: 'OBJ_Scroll_GlobeOfInvulnerability',
    itemShard: 'items/7d-0001.json',
    rootArtifact: 'root-template-programs/7d-0000.json',
    ruleArtifact: 'rules/spells/01.json',
    context: 'scroll',
    target: 'any',
    actionType: 12,
    consume: ['item', 1],
    useIds: {standard: 'bg3-use-0aa24454244a69ce7044', honour: 'bg3-use-258080ecfad088781384'},
    a33UseIds: {standard: 'bg3-use-dbb827f2900c94895e9a', honour: 'bg3-use-b15149dbf8fe4942a60f'},
    args: [uuid('edca6656-dc8c-410b-9f16-fcc02d5ed803'), integer(3), symbol('Projectile_AiHelper_Silence'), empty(), empty(), symbol('GLOBE_OF_INVULNERABILITY_AURA')],
    scope: 'GROUND',
    raw: 'GROUND:Summon(edca6656-dc8c-410b-9f16-fcc02d5ed803, 3,Projectile_AiHelper_Silence,,,GLOBE_OF_INVULNERABILITY_AURA)',
    spellFlags: 'HasVerbalComponent;HasSomaticComponent;IsSpell;IsConcentration',
    concentration: true,
    canStand: null,
    fieldOpcodeCount: 1,
    summonOccurrences: 1,
  },
  {
    spellId: 'Target_HAG_Hagspawn_SummonHusband',
    ruleId: 'bg3:rule:spell:VGFyZ2V0X0hBR19IYWdzcGF3bl9TdW1tb25IdXNiYW5k',
    itemId: 'bg3:item:rt:b1b872db-43f0-45f7-b34f-d814ef9cb64c:stats:VU5JX0hBR19XYW5kX1N1bW1vbkh1c2JhbmQ',
    statsId: 'UNI_HAG_Wand_SummonHusband',
    itemShard: 'items/19-0001.json',
    rootArtifact: 'root-template-programs/19-0000.json',
    ruleArtifact: 'rules/spells/1f.json',
    context: 'generic',
    target: 'any',
    actionType: 12,
    consume: ['none', 0],
    useIds: {standard: 'bg3-use-e6907711d9e55e4efca7', honour: 'bg3-use-7ec731ca790d29d2ac3a'},
    args: [uuid('f1876ebc-8a68-410a-885f-21f991a5df09'), integer(10), empty(), empty(), string('SummonHusband'), symbol('SMELLY')],
    scope: 'GROUND',
    raw: "GROUND:Summon(f1876ebc-8a68-410a-885f-21f991a5df09,10,,,'SummonHusband',SMELLY)",
    spellFlags: null,
    concentration: false,
    canStand: 'f1876ebc-8a68-410a-885f-21f991a5df09',
    fieldOpcodeCount: 1,
    summonOccurrences: 1,
  },
  {
    spellId: 'Target_Scrying',
    ruleId: 'bg3:rule:spell:VGFyZ2V0X1Njcnlpbmc',
    itemId: 'bg3:item:rt:b2da7238-a197-4ecc-9c6d-29035f2dc520:stats:UkVGX1ByaW1pdGl2ZXM',
    statsId: 'REF_Primitives',
    itemShard: 'items/dc-0000.json',
    rootArtifact: 'root-template-programs/dc-0001.json',
    ruleArtifact: 'rules/spells/5b.json',
    context: 'generic',
    target: 'creature',
    actionType: 12,
    consume: ['none', 0],
    useIds: {standard: 'bg3-use-7d6094826d8b039ef0a1', honour: 'bg3-use-b8f140f5b9ca9ce90ec7'},
    args: [uuid('2f83206a-13c3-4ecb-a599-f6aa4708e149'), integer(10)],
    scope: 'GROUND',
    raw: 'GROUND:Summon(2f83206a-13c3-4ecb-a599-f6aa4708e149,10)',
    spellFlags: 'IsConcentration;CannotTargetCharacter;CannotTargetItems',
    concentration: true,
    canStand: '58450a22f414df9a9fd8-c7c9-4419-955d-',
    runtimeAllowed: false,
    fieldOpcodeCount: 1,
    summonOccurrences: 1,
  },
  {
    spellId: 'Target_SleetStorm',
    ruleId: 'bg3:rule:spell:VGFyZ2V0X1NsZWV0U3Rvcm0',
    itemId: 'bg3:item:rt:be05f7d0-ffa0-46e3-a0d6-66e3333159f1:stats:T0JKX1Njcm9sbF9TbGVldFN0b3Jt',
    statsId: 'OBJ_Scroll_SleetStorm',
    itemShard: 'items/5b-0001.json',
    rootArtifact: 'root-template-programs/5b-0000.json',
    ruleArtifact: 'rules/spells/7b.json',
    context: 'scroll',
    target: 'any',
    actionType: 12,
    consume: ['item', 1],
    useIds: {standard: 'bg3-use-0ef7886b425eaccfb192', honour: 'bg3-use-f036b9f74e99011010a4'},
    a33UseIds: {standard: 'bg3-use-f5ca5d5b81b112bdcac7', honour: 'bg3-use-95af4270d3514a71010a'},
    args: [uuid('802b8b51-1bcf-469d-8663-2f1dc9698982'), integer(10), empty(), empty(), symbol('SleetStorm'), symbol('SLEET_STORM')],
    scope: 'GROUND',
    raw: 'GROUND:Summon(802b8b51-1bcf-469d-8663-2f1dc9698982, 10,,,SleetStorm,SLEET_STORM);RemoveStatus(BURNING)',
    spellFlags: 'HasVerbalComponent;HasSomaticComponent;IsSpell;IsConcentration',
    concentration: true,
    canStand: null,
    fieldOpcodeCount: 2,
    summonOccurrences: 1,
  },
]);

const RUNTIME_SIGNATURES = Object.freeze({
  Projectile_ALCH_Solution_Grenade_Light: Object.freeze({
    astSha256: '2a8663c6a4f92b779b88634fa38b4179efd107d8b90d700485e0a7e9eee2ccde',
    argsSha256: 'aff7fbec0ad767c38ecf75d7bef7c31a2c59728c828007d00e1f8286fc5cbd53', spellLevel: 0,
  }),
  Target_ArcaneEye: Object.freeze({
    astSha256: '5d1a90764f3bf615bbfac5393b3f57d4b86e010271f039820eb190a083cee8c9',
    argsSha256: '7690ed4d121b9b673cbb1d80957cd329c3f86c869cf0792ce5ce606a7b0a3ee3', spellLevel: 4,
  }),
  Target_CloudOfDaggers: Object.freeze({
    astSha256: 'a2461d8dc35d4a48a462bff453985d69fe84b92f7360e15c9142dbbc69db4ade',
    argsSha256: '10772b636dcfcafecef8215794e4bd225398bca53530a79dee0c6a4a68db077b', spellLevel: 2,
  }),
  Target_ConjureIntellectDevour: Object.freeze({
    astSha256: 'c9c0770989e16bce6158a2f231cabb22b1686c62a44c37a4fab544bc4aff608c',
    argsSha256: '7c7584181f9e7871a794f8aea0a27d54dcec3d51248a89267aa2e84d171d2d59', spellLevel: 0,
  }),
  Target_CursedTome_Seelie_Summon: Object.freeze({
    astSha256: 'd9c3a8e19c49a6ea45a6ff627d406f20e6f2a1679d68ea3f055049074fc89e13',
    argsSha256: '961e510ca9e3cecf5e25d0621e29fc6afffd69808e476f2fa017684bb539f762', spellLevel: 6,
  }),
  Target_FlamingSphere: Object.freeze({
    astSha256: '331edca0463491276e283606a68c500f03041cd74f329e57a5e8dd43fd99dd48',
    argsSha256: '7b8787e8fd7b6658e0ec158056abc9561f5dfc7eee800b177f939ff5beb6edfc', spellLevel: 2,
  }),
  Target_GlobeOfInvulnerability: Object.freeze({
    astSha256: 'f9f222deac76c27d3a9b67c7c693a6e865519b20f91d728b1e9a7824929c845f',
    argsSha256: 'd1216a587090ee537e82f75b1cc2d8c0f6e54125766124ef1021df5de874ea79', spellLevel: 6,
  }),
  Target_HAG_Hagspawn_SummonHusband: Object.freeze({
    astSha256: '172b4fbeb4dbef140d0e1ba5f040ad0ec86f2981cdfb11da73819ef897a895cf',
    argsSha256: '8cccec0d99c7edaa11a79ece46ff9c0530b8a4e72c252f3eecd2e041c2cb0097', spellLevel: 0,
  }),
  Target_Scrying: Object.freeze({
    astSha256: '6277547e275898365473661585296a43cbf9ce6f226c045caed30bce55d077b9',
    argsSha256: 'e69c1bb7d0da2ca4bedb5ad983599b25e06ab9b043397c4dc03bb2c5f9d2e7ae', spellLevel: 5,
  }),
  Target_SleetStorm: Object.freeze({
    astSha256: 'c6b1ea031684e08ebaf1db4039b00bb118be7afc3e9452680735eaf0d330ec38',
    argsSha256: '4e60376a6367bbcf6208212264dd60fef5c32d13d5c9ffafdba1a75fd97c52e6', spellLevel: 3,
  }),
});

const MIXED_SOURCES = Object.freeze([
  {
    spellId: 'Projectile_SpiderlingSpawning', statsId: 'OBJ_THR_GiantSpiderEggSack',
    itemId: 'bg3:item:rt:3c65dc67-b235-4af3-9ffe-f078e58a8391:stats:T0JKX1RIUl9HaWFudFNwaWRlckVnZ1NhY2s',
    itemShard: 'items/0e-0000.json', rootArtifact: 'root-template-programs/0e-0000.json', ruleArtifact: 'rules/spells/45.json',
    actionType: 32, target: 'creatureOrObject', useIds: {standard: 'bg3-use-6bc597a8af5afdab3ade', honour: 'bg3-use-e9e30604c85de2218e68'},
  },
  {
    spellId: 'Projectile_SpiderlingSpawning', statsId: 'OBJ_THR_GiantSpiderEggSack',
    itemId: 'bg3:item:rt:8e269d9d-d21f-48a9-8b9d-32d20e132823:stats:T0JKX1RIUl9HaWFudFNwaWRlckVnZ1NhY2s',
    itemShard: 'items/19-0000.json', rootArtifact: 'root-template-programs/19-0000.json', ruleArtifact: 'rules/spells/45.json',
    actionType: 32, target: 'creatureOrObject', useIds: {standard: 'bg3-use-dd95a182fe536478a63f', honour: 'bg3-use-cb187de7a9425552def4'},
  },
  {
    spellId: 'Projectile_SpiderlingSpawning', statsId: 'OBJ_THR_LOW_IronThrone_Mizora_SpiderSac',
    itemId: 'bg3:item:rt:93f8c64b-2d55-4784-aca5-077f75a7ee4d:stats:T0JKX1RIUl9MT1dfSXJvblRocm9uZV9NaXpvcmFfU3BpZGVyU2Fj',
    itemShard: 'items/74-0001.json', rootArtifact: 'root-template-programs/74-0000.json', ruleArtifact: 'rules/spells/45.json',
    actionType: 32, target: 'creatureOrObject', useIds: {standard: 'bg3-use-18155bec6b599a49271b', honour: 'bg3-use-b99b72565d0ed1bd0abb'},
  },
  {
    spellId: 'Projectile_SpiderlingSpawning', statsId: 'OBJ_THR_SpiderEggSack',
    itemId: 'bg3:item:rt:93f8c64b-2d55-4784-aca5-077f75a7ee4d:stats:T0JKX1RIUl9TcGlkZXJFZ2dTYWNr',
    itemShard: 'items/a4-0000.json', rootArtifact: 'root-template-programs/a4-0000.json', ruleArtifact: 'rules/spells/45.json',
    actionType: 32, target: 'creatureOrObject', useIds: {standard: 'bg3-use-1c22e1fe1ad718c817de', honour: 'bg3-use-8c8e1951cafc8eb8501f'},
  },
  {
    spellId: 'Projectile_SpiderlingSpawning', statsId: 'OBJ_THR_GiantSpiderEggSack',
    itemId: 'bg3:item:rt:a2206554-7a9f-49c0-a274-84279cc9afa4:stats:T0JKX1RIUl9HaWFudFNwaWRlckVnZ1NhY2s',
    itemShard: 'items/9a-0001.json', rootArtifact: 'root-template-programs/9a-0000.json', ruleArtifact: 'rules/spells/45.json',
    actionType: 32, target: 'creatureOrObject', useIds: {standard: 'bg3-use-b43d37584aee5e8ac1b0', honour: 'bg3-use-9311e7bc20a7605d3a52'},
  },
  {
    spellId: 'Projectile_SpiderlingSpawning', statsId: 'OBJ_THR_GiantSpiderEggSack',
    itemId: 'bg3:item:rt:b266897b-065d-4a23-bfab-c6f82f6512a7:stats:T0JKX1RIUl9HaWFudFNwaWRlckVnZ1NhY2s',
    itemShard: 'items/7d-0001.json', rootArtifact: 'root-template-programs/7d-0001.json', ruleArtifact: 'rules/spells/45.json',
    actionType: 32, target: 'creatureOrObject', useIds: {standard: 'bg3-use-f92fc542a838248bf900', honour: 'bg3-use-7b443f9ae5c6f3641026'},
  },
  {
    spellId: 'Target_FOR_ThayanCellar_SummonQuasit', statsId: 'OBJ_Scroll_SummonQuasit',
    itemId: 'bg3:item:rt:6b881dce-b87f-4c3c-aa98-7ba4b07c009b:stats:T0JKX1Njcm9sbF9TdW1tb25RdWFzaXQ',
    itemShard: 'items/31-0000.json', rootArtifact: 'root-template-programs/31-0000.json', ruleArtifact: 'rules/spells/72.json',
    actionType: 12, target: 'creature', useIds: {standard: 'bg3-use-f934ccab358cca0501d6', honour: 'bg3-use-6391fa905c5987b70205'},
  },
]);

function readJson(file) {
  const absolute = path.resolve(file);
  if (!jsonCache.has(absolute)) jsonCache.set(absolute, JSON.parse(fs.readFileSync(absolute, 'utf8')));
  return jsonCache.get(absolute);
}

function repoFile(relative) {
  return path.join(repo, ...String(relative).split('/'));
}

function catalogFile(relative) {
  return path.join(catalogRoot, ...String(relative).split('/'));
}

function catalogArtifact(descriptor) {
  return path.relative(catalogRoot, repoFile(descriptor.path)).split(path.sep).join('/');
}

function plain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}

function same(a, b) {
  return canonical(a) === canonical(b);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function digestRows(rows, project) {
  return sha256(rows.map(project).sort((a, b) => a.localeCompare(b, 'en')).join('\n'));
}

function opcodeRows(value, out = []) {
  if (Array.isArray(value)) {
    for (const row of value) opcodeRows(row, out);
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  if (typeof value.op === 'string') out.push(value);
  for (const child of Object.values(value)) opcodeRows(child, out);
  return out;
}

function predicates(value, name, out = []) {
  if (Array.isArray(value)) {
    for (const row of value) predicates(row, name, out);
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  if (value.kind === 'predicate' && value.name === name) out.push(value);
  for (const child of Object.values(value)) predicates(child, name, out);
  return out;
}

function exactKeys(value, keys) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && same(Object.keys(value).sort(), keys.slice().sort());
}

function effectiveMechanics(item, profile) {
  const honour = item.source?.honourOverlay?.item?.mechanics;
  return profile === 'honour' && honour ? honour : item.mechanics;
}

const ruleProgramRecords = [];
for (const descriptor of manifest.files.rules || []) {
  const payload = readJson(repoFile(descriptor.path));
  const artifact = catalogArtifact(descriptor);
  for (const rule of payload.rules || []) for (const profile of ['standard', 'honour']) {
    const program = rule.programs?.[profile];
    if (!program) continue;
    // The active-v8 family census is defined by the executable entries in each
    // field bytecode array.  Recursing through opcode operands incorrectly turns
    // Summon nodes nested under condition/branch opcodes into additional program
    // carriers (158 profiles / 79 rules / 228 tree occurrences).  Projection
    // carrier analysis below intentionally remains recursive because it asks the
    // separate question whether a selected item source contains any Summon node.
    const opcodes = (program.fields || []).flatMap(field => field.bytecode || []);
    const summons = opcodes.filter(opcode => opcode.op === 'summon');
    ruleProgramRecords.push({artifact, payload, rule, profile, program, opcodes, summons});
  }
}

const programRecordsById = new Map();
for (const record of ruleProgramRecords) {
  const rows = programRecordsById.get(record.program.id) || [];
  rows.push(record);
  programRecordsById.set(record.program.id, rows);
}

function selectedFields(record, ref) {
  const wanted = new Set(ref?.fields || []);
  return (record?.program?.fields || []).filter(field => wanted.has(String(field.field || '')));
}

function summonSources(use) {
  const projection = use?.program?.projection;
  const refs = [...(projection?.entrypoints || []), ...(projection?.transitive || [])];
  return refs.flatMap(ref => (programRecordsById.get(String(ref?.programId || '')) || []).map(record => {
    const fields = selectedFields(record, ref);
    const opcodes = fields.flatMap(field => opcodeRows(field.bytecode || []));
    const summons = opcodes.filter(opcode => opcode.op === 'summon');
    return {ref, record, fields, opcodes, summons};
  })).filter(source => source.summons.length > 0);
}

function rootForUse(use) {
  const payload = readJson(catalogFile(use.program.rootArtifact));
  return (payload.programs || []).find(program => program.id === use.program.id) || null;
}

const itemVariants = [];
for (const descriptor of manifest.files.items || []) {
  const payload = readJson(repoFile(descriptor.path));
  const itemShard = catalogArtifact(descriptor);
  for (const item of payload.items || []) for (const profile of ['standard', 'honour']) {
    itemVariants.push({item, itemShard, profile, mechanics: effectiveMechanics(item, profile)});
  }
}

const itemCarriers = itemVariants.flatMap(variant => (variant.mechanics?.actions || []).map(use => {
  const sources = summonSources(use);
  if (!sources.length) return null;
  const spellIds = [...new Set(sources.map(source => String(source.ref.bg3Id || '')))];
  return {...variant, use, root: rootForUse(use), sources, spellIds};
})).filter(Boolean);

const typedCarriers = itemCarriers.filter(row => row.use.program?.projection?.mode === 'typed'
  && row.use.program.projection.complete === true);
const mixedCarriers = itemCarriers.filter(row => row.use.program?.projection?.mode === 'mixed'
  && row.use.program.projection.complete === false);

const typedBySpell = new Map(TYPED_SOURCES.map(source => [source.spellId, source]));
const mixedByItem = new Map(MIXED_SOURCES.map(source => [source.itemId, source]));

function carrierTuple(row) {
  const source = row.sources[0];
  return {
    profile: row.profile,
    itemShard: row.itemShard,
    item: row.item,
    use: row.use,
    root: row.root,
    source: {
      ref: source.ref,
      artifact: source.record.artifact,
      rule: source.record.rule,
      program: source.record.program,
    },
  };
}

function typedCarrierCheck(tuple) {
  const failures = [];
  const fail = (condition, label) => { if (!condition) failures.push(label); };
  const ref = tuple?.source?.ref;
  const expected = typedBySpell.get(String(ref?.bg3Id || ''));
  if (!expected) return {ok: false, failures: ['unknown-spell-id']};
  const runtimeSignature = RUNTIME_SIGNATURES[expected.spellId];

  const profile = String(tuple.profile || '');
  const item = tuple.item || {};
  const use = tuple.use || {};
  const contract = use.program || {};
  const projection = contract.projection || {};
  const root = tuple.root || {};
  const rule = tuple.source?.rule || {};
  const program = tuple.source?.program || {};
  const expectedProgramId = `${expected.ruleId}:program:${profile}`;
  const expectedRootId = `${expected.itemId}:root-action:${profile}:OnUsePeaceActions:0`;
  const expectedFields = expected.canStand
    ? ['SpellProperties', 'TargetConditions', 'UseCosts']
    : ['SpellProperties', 'UseCosts'];
  const expectedRoles = expected.canStand
    ? ['consequences', 'target-guard', 'resource-cost']
    : ['consequences', 'resource-cost'];

  fail(['standard', 'honour'].includes(profile), 'profile');
  fail(item.id === expected.itemId, 'item-id');
  fail(item.source?.statsId === expected.statsId, 'stats-id');
  fail(tuple.itemShard === expected.itemShard, 'item-shard');
  fail(use.id === expected.useIds[profile], 'use-id');
  fail(use.handler === 'bg3RuleProgram', 'handler');
  fail(use.cost === 'action', 'cost');
  fail(use.target === expected.target, 'generated-target');
  fail(use.consume?.kind === expected.consume[0] && +use.consume?.amount === expected.consume[1], 'consume');
  fail(use.rollPolicy === 'player-input-required', 'roll-policy');

  const primary = contract.sourceAction?.primary || {};
  fail(contract.id === expectedRootId, 'root-contract-id');
  fail(contract.sourceProfile === profile, 'contract-profile');
  fail(contract.rootArtifact === expected.rootArtifact, 'root-artifact');
  fail(contract.mode === 'typed', 'contract-mode');
  fail(contract.commitPolicy === 'item-action-contract-once', 'commit-policy');
  fail(contract.ruleProgramId === expectedProgramId, 'rule-program-id');
  fail(contract.ruleSourceProfile === profile, 'rule-source-profile');
  fail(contract.artifact === expected.ruleArtifact, 'contract-rule-artifact');
  fail(contract.invokedRuleResourceCostPolicy === 'caller-item-action', 'resource-policy');
  fail(primary.actionType === expected.actionType && primary.index === 0
    && primary.trigger === 'OnUsePeaceActions' && primary.rootProgramId === expectedRootId, 'source-action');

  fail(projection.schemaVersion === 'bg3-action-rule-projection/1', 'projection-schema');
  fail(projection.sourceProfile === profile, 'projection-profile');
  fail(projection.context === expected.context, 'projection-context');
  fail(projection.mode === 'typed' && projection.complete === true, 'projection-readiness');
  fail(projection.executionPolicy === 'all-reachable-opcodes-or-fail-closed', 'projection-policy');
  fail(Array.isArray(projection.unresolved) && projection.unresolved.length === 0, 'projection-unresolved');
  fail(Array.isArray(projection.entrypoints) && projection.entrypoints.length === 1, 'entrypoint-cardinality');
  fail(Array.isArray(projection.transitive) && projection.transitive.length === 0, 'transitive-cardinality');
  fail(same(projection.requiredRoles, REQUIRED_ROLES), 'projection-required-roles');
  fail(same(projection.entrypoints?.[0], ref), 'entrypoint-ref');

  fail(ref?.kind === 'spell', 'ref-kind');
  fail(ref?.ruleId === expected.ruleId && ref?.bg3Id === expected.spellId, 'ref-rule-identity');
  fail(ref?.programId === expectedProgramId && ref?.artifact === expected.ruleArtifact, 'ref-program-provenance');
  fail(ref?.sourceProfile === profile && ref?.mode === 'typed', 'ref-profile-mode');
  fail(same(ref?.fields, expectedFields), 'ref-fields');
  fail(same(ref?.roles, expectedRoles), 'ref-roles');
  fail(same(ref?.requiredRoles, REQUIRED_ROLES), 'ref-required-roles');
  fail(tuple.source?.artifact === expected.ruleArtifact, 'loaded-rule-artifact');

  fail(root.schemaVersion === 'bg3-rule-program/1' && root.id === expectedRootId, 'root-identity');
  fail(root.sourceProfile === profile && root.trigger === 'OnUsePeaceActions'
    && root.actionType === expected.actionType && root.mode === 'typed', 'root-source');
  fail(root.sourceAction?.rootProgramId === expectedRootId
    && root.sourceAction?.trigger === 'OnUsePeaceActions'
    && root.sourceAction?.actionType === expected.actionType
    && root.sourceAction?.index === 0, 'root-source-action');
  fail(Array.isArray(root.commit) && root.commit.length === 1, 'root-commit-cardinality');
  const commit = root.commit?.[0] || {};
  fail(commit.op === 'commitFromItemAction' && commit.executable === true && commit.phase === 'commit', 'root-commit');
  fail(commit.binding?.cost === use.cost
    && commit.binding?.consume?.kind === expected.consume[0]
    && +commit.binding?.consume?.amount === expected.consume[1], 'root-commit-binding');
  fail(Array.isArray(root.consequences) && root.consequences.length === 1, 'root-consequence-cardinality');
  const invoke = root.consequences?.[0] || {};
  fail(invoke.op === 'invokeRuleProgram' && invoke.executable === true
    && invoke.programId === expectedProgramId && invoke.programMode === 'typed'
    && invoke.artifact === expected.ruleArtifact
    && invoke.resourceCostPolicy === 'caller-item-action' && invoke.phase === 'consequences', 'root-invoke');

  fail(rule.id === expected.ruleId && rule.bg3Id === expected.spellId && rule.kind === 'spell', 'rule-identity');
  fail(rule.artifact === expected.ruleArtifact, 'rule-artifact');
  fail(program.id === expectedProgramId && program.sourceRuleId === expected.ruleId
    && program.sourceProfile === profile && program.mode === 'typed', 'program-identity');
  fail(program.artifact === expected.ruleArtifact, 'program-artifact');
  fail(program.executionModel === 'validate-commit-consequences'
    && program.rollPolicy === 'player-input-required'
    && program.localizedTextExecutable === false, 'program-execution-contract');
  fail(same(rule.programs?.[profile], program), 'program-rule-binding');

  const flagsPresent = Object.prototype.hasOwnProperty.call(rule.properties || {}, 'SpellFlags');
  if (expected.spellFlags === null) fail(!flagsPresent, 'spell-flags-absence');
  else fail(flagsPresent && rule.properties.SpellFlags === expected.spellFlags, 'spell-flags');
  const concentration = String(rule.properties?.SpellFlags || '').split(';').includes('IsConcentration');
  fail(concentration === expected.concentration, 'concentration');
  fail(!!runtimeSignature, 'runtime-signature');
  const levelPresent = Object.prototype.hasOwnProperty.call(rule.properties || {}, 'Level');
  const spellLevel = levelPresent ? +rule.properties.Level : 0;
  fail(Number.isInteger(spellLevel) && spellLevel === runtimeSignature?.spellLevel, 'spell-level');

  const selectedProgramFields = (program.fields || []).filter(field => (ref.fields || []).includes(field.field));
  const spellProperties = selectedProgramFields.filter(field => field.field === 'SpellProperties');
  fail(spellProperties.length === 1, 'spell-properties-cardinality');
  const field = spellProperties[0] || {};
  fail(field.role === 'consequences' && field.raw === expected.raw, 'spell-properties-source');
  fail(sha256(canonical(field.ast || null)) === runtimeSignature?.astSha256, 'spell-properties-ast-sha256');
  const fieldOpcodes = opcodeRows(field.bytecode || []);
  const summons = fieldOpcodes.filter(opcode => opcode.op === 'summon');
  const player = summons.filter(opcode => opcode.scopePolicy === 'execute-player' && opcode.scope !== 'AI_ONLY');
  fail(fieldOpcodes.length === expected.fieldOpcodeCount, 'field-opcode-count');
  fail(summons.length === expected.summonOccurrences, 'summon-occurrences');
  fail(player.length === 1, 'player-summon-cardinality');
  const summon = player[0] || {};
  fail(exactKeys(summon, ['op', 'executable', 'bg3Functor', 'args', 'phase', 'scope', 'scopePolicy']), 'summon-keys');
  fail(summon.op === 'summon' && summon.bg3Functor === 'Summon'
    && summon.executable === true && summon.phase === 'consequences'
    && summon.scope === expected.scope && summon.scopePolicy === 'execute-player', 'summon-header');
  fail(same(summon.args, expected.args), 'summon-args');
  fail(sha256(canonical(summon.args || null)) === runtimeSignature?.argsSha256, 'summon-args-sha256');

  const canStand = predicates(selectedProgramFields.flatMap(fieldRow => fieldRow.bytecode || []), 'CanStand');
  if (expected.canStand === null) fail(canStand.length === 0, 'unexpected-can-stand');
  else {
    fail(canStand.length === 1, 'can-stand-cardinality');
    const predicate = canStand[0] || {};
    fail(exactKeys(predicate, ['kind', 'name', 'args'])
      && predicate.kind === 'predicate' && predicate.name === 'CanStand'
      && Array.isArray(predicate.args) && predicate.args.length === 1
      && exactKeys(predicate.args[0], ['kind', 'value'])
      && predicate.args[0].kind === 'string' && predicate.args[0].value === expected.canStand, 'can-stand-signature');
  }

  return {ok: failures.length === 0, failures, expected, summon, canStand};
}

function mixedCarrierLine(row) {
  const expected = mixedByItem.get(row.item.id);
  return [row.profile, row.item.id, row.use.id, row.spellIds.join(','), row.itemShard,
    row.use.program.rootArtifact, row.sources[0]?.ref?.artifact, row.use.program.sourceAction?.primary?.actionType,
    row.use.target, row.use.consume?.kind, +row.use.consume?.amount || 0, expected?.statsId || ''].join('|');
}

function expectedMixedLine(source, profile) {
  return [profile, source.itemId, source.useIds[profile], source.spellId, source.itemShard,
    source.rootArtifact, source.ruleArtifact, source.actionType, source.target, 'item', 1, source.statsId].join('|');
}

function programsForTuple(tuple) {
  const projection = tuple.use.program.projection;
  const artifacts = [...new Set([...(projection.entrypoints || []), ...(projection.transitive || [])]
    .map(ref => String(ref.artifact || '')).filter(Boolean))];
  return artifacts.flatMap(artifact => (readJson(catalogFile(artifact)).rules || []).map(rule => {
    const program = rule.programs?.[tuple.profile];
    return program ? {program, artifact} : null;
  }).filter(Boolean));
}

function collectTypedA33Rows() {
  const typedSpellIds = new Set(TYPED_SOURCES.map(source => source.spellId));
  return itemVariants.flatMap(variant => (variant.mechanics?.actions || []).map(use => {
    if (use.handler !== 'bg3LearnSpellProgram') return null;
    const contract = use.program?.learnSpell;
    if (!typedSpellIds.has(String(contract?.spellId || ''))) return null;
    const spell = contract.spell || {};
    const rulePayload = readJson(catalogFile(spell.artifact));
    const rule = (rulePayload.rules || []).find(candidate => candidate.id === spell.ruleId
      && candidate.bg3Id === contract.spellId);
    const program = rule?.programs?.[variant.profile];
    const root = rootForUse(use);
    const attributes = root?.attributes || {};
    const conditionPresent = Object.prototype.hasOwnProperty.call(attributes, 'Conditions');
    return {
      profile: variant.profile,
      itemId: variant.item.id,
      actionId: use.id,
      spellId: String(contract.spellId || ''),
      programId: String(spell.programId || ''),
      artifact: String(spell.artifact || ''),
      rootId: String(use.program.id || ''),
      rootArtifact: String(use.program.rootArtifact || ''),
      conditionState: conditionPresent ? 'present' : 'missing',
      condition: conditionPresent ? String(attributes.Conditions ?? '') : '',
      mode: String(program?.mode || ''),
      use,
      root,
      rule,
      program,
    };
  })).filter(Boolean).sort((a, b) => a.profile.localeCompare(b.profile, 'en')
    || a.itemId.localeCompare(b.itemId, 'en') || a.actionId.localeCompare(b.actionId, 'en'));
}

const typedA33Rows = collectTypedA33Rows();

function a33DigestLine(row) {
  return [row.profile, row.itemId, row.actionId, row.spellId, row.programId,
    row.artifact, row.rootId, row.rootArtifact, row.condition].join('|');
}

function loadEngine(random = () => 0, fetchImpl = null) {
  const html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
  let source = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  source = source.replace(/\(async function init\(\)\{[\s\S]*$/, '');
  const dispatchDeclaration = '  const summonDispatchProof=(record,proof)=>{';
  const dispatchCall = "const done=summonUseItemApplyWrapper(record.entryId,record.casterId,'ground',proof.carrier,record.useId);";
  const auditHook = "globalThis.bg3ItemSummonTestInjectLateFailureOnce=()=>{state.summonLateFailureOnce=true;return true;};";
  assert.equal(source.split(dispatchDeclaration).length, 2, 'private Summon dispatch declaration drifted');
  assert.equal(source.split(dispatchCall).length, 2, 'private Summon dispatch call drifted');
  assert.equal(source.split(auditHook).length, 2, 'private Summon audit hook drifted');
  source = source.replace(dispatchDeclaration,
    '  const summonCertificateBridge={hold:false,last:null};\n' + dispatchDeclaration);
  source = source.replace(dispatchCall,
    `if(summonCertificateBridge.hold){summonCertificateBridge.hold=false;summonCertificateBridge.last={record,proof};return false;}${dispatchCall}`);
  source = source.replace(auditHook, auditHook + `
    globalThis.__bg3SummonCertificateBridge=privateIntrinsics.freeze({
      holdNext(){summonCertificateBridge.hold=true;summonCertificateBridge.last=null;return true;},
      lastArgs(){const row=summonCertificateBridge.last;return row?[row.record.entryId,row.record.casterId,'ground',row.proof.carrier,row.record.useId]:null;},
      applyArgs(args){return privateIntrinsics.arrayIsArray(args)?summonUseItemApplyWrapper(args[0],args[1],args[2],args[3],args[4],args[5]):false;}
    });`);
  source += `
    globalThis.__bg3SummonRuntimeAudit = {
      setState(s) {
        chars=s.chars||[]; journal=s.journal||[]; itemsDB=s.items||[]; spellsDB=s.spells||[];
        bg3Catalog.items=new Map(itemsDB.filter(item=>bg3CatalogIsId(item&&item.id)).map(item=>[item.id,item]));
        abilitiesDB=s.abilities||[]; racesDB=s.races||[]; classesDB=s.classes||[];
        rulesDB=s.rules||[]; foesDB=s.foes||[]; activeCharId=s.activeCharId||null; fxRound=s.fxRound||1;
        harvestedSources=s.harvestedSources&&typeof s.harvestedSources==='object'?s.harvestedSources:{};
        bg3SceneState=bg3SceneNormalizeState(s.bg3SceneState); bg3StoryState=bg3StoryNormalizeState(s.bg3StoryState);
        bg3TadpoleState=bg3TadpoleNormalizeState(s.bg3TadpoleState); bg3TreasureState=bg3TreasureNormalizeState(s.bg3TreasureState);
        combat=normalizeCombatState(s.combat); lastCastEvent=null; castCtx=null; rollSpec=null; rollQueue=[];
        rollCompleting=false; bg3RollPromptScope=null; bg3RuleProgramClear(); bg3LifecycleReset();
        bg3GithbornMindcrusherTrustCharacters(chars); bg3InterruptReset(); bg3InventoryStatusTransitionReset();
        bg3SceneCatalogReset(); fxInvalidate();
      },
      state() { return {chars,itemsDB,spellsDB,abilitiesDB,racesDB,classesDB,foesDB,journal,
        harvestedSources,bg3SceneState,bg3StoryState,bg3TadpoleState,bg3TreasureState,
        activeCharId,fxRound,lastCastEvent,combat}; },
      setProfile(profile) { bg3Catalog.preferredProfile=profile; },
      compile: bg3RuleProgramCompile,
      report: bg3RuleProgramReport,
      guardSupported: bg3ProgramGuardSupported,
      guardResult: bg3ProgramGuardResult,
      typedFamily(name) { return BG3_TYPED_ITEM_OPCODE_FAMILIES.has(name); },
      bg3CatalogUseRefs, bg3CatalogEnsureIndex, bg3CatalogHydrate, bg3RuleProgramPrepare,
      bg3RuleProgramPlanOf, bg3ItemProgramOpen, castConfirm, closeCastModal, itemUseOf,
      bg3WizardProfileBinding, seedClassesDB, seedFoesDB, combatStart, combatUseItem,
      bg3ItemSummonAudit, bg3ItemSummonTestInjectLateFailureOnce,
      bg3LearnSpellPlanFor, bg3LearnSpellCommit, bg3LearnSpellCommitAudit,
      bg3LearnedSpellPrepare, bg3LearnedSpellApply,
      bg3InterruptDescriptorsOf,
      bg3InterruptTestSeedPrepared(it,ref,descriptor,payload) { const checked=bg3InterruptDescriptorCheck(it,ref,descriptor),programs=new Map();
        if(!checked.ok)return checked;for(const program of bg3LifecyclePrograms(payload))programs.set(descriptor.artifact+'|'+program.id,program);
        const program=programs.get(descriptor.artifact+'|'+descriptor.programId),verified=bg3InterruptProgramCheck(descriptor,program);if(!verified.ok)return verified;
        const prepared={ok:true,key:descriptor.id,epoch:bg3Catalog.epoch,profile:bg3Catalog.preferredProfile||'standard',fingerprint:bg3InterruptFingerprint(descriptor),it,ref,descriptor:itemClone(descriptor),program,payloads:new Map([[descriptor.artifact,payload]]),programs};
        bg3InterruptRuntime.prepared.set(descriptor.id,prepared);return prepared; },
      charFxAll, runScheduledSave, dndWorldExportPayload, dndWorldImportPayload, removeActiveFx,
      catalogItem(id) { return bg3Catalog.items.get(id)||null; },
      catalogRebind(id,item) { if(item===undefined)bg3Catalog.items.delete(id);else bg3Catalog.items.set(id,item);return bg3Catalog.items.get(id)||null; },
      castState() { return {ctx:castCtx,spec:castCtx&&castCtx.spec}; },
      setCastContext(value) { castCtx=value; },
      setConfirmResults(values) { globalThis.__confirmQueue=values.slice(); },
      setPromptResults(values) { globalThis.__promptQueue=values.slice(); globalThis.__promptCount=0; },
      promptCount() { return globalThis.__promptCount||0; },
      elementText(id) { return document.getElementById(id).textContent; },
      storedValue(key) { return globalThis.localStorage.getItem(key); },
      captureNextDispatch(block=true) { return block===true&&globalThis.__bg3SummonCertificateBridge.holdNext(); },
      lastDispatch() { return globalThis.__bg3SummonCertificateBridge.lastArgs(); },
      applyArgs(args) { return globalThis.__bg3SummonCertificateBridge.applyArgs(args); },
      poisonGlobal(key,victim) { const owner=globalThis, descriptor=Object.getOwnPropertyDescriptor(owner,key);
        let hits=0; if(!descriptor||descriptor.configurable!==true)throw new Error('test global binding is not configurable: '+key);
        Object.defineProperty(owner,key,{configurable:true,enumerable:!!descriptor.enumerable,get(){hits++;if(victim)victim.notes='global-accessor-fired';return descriptor.value;}});
        return {hits:()=>hits,restore(){Object.defineProperty(owner,key,descriptor);}}; },
      worldSnapshot() { return itemClone({chars,foesDB,combat,journal,harvestedSources,bg3SceneState,
        bg3StoryState,bg3TadpoleState,bg3TreasureState,lastCastEvent,fxRound,
        castCommitted:castCtx&&castCtx.combatCommitted}); }
    };
  `;

  const elements = new Map(), stored = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id, value: '', textContent: '', innerHTML: '', style: {}, dataset: {}, className: '', disabled: false,
      classList: {toggle() {}, add() {}, remove() {}}, closest() { return null; }, focus() {}, click() {},
      appendChild() {}, remove() {}, setAttribute() {}, getAttribute() { return null; },
    });
    return elements.get(id);
  };
  const context = {
    console,
    Math: Object.assign(Object.create(Math), {random}),
    Date,
    JSON,
    crypto: crypto.webcrypto,
    TextEncoder,
    Blob,
    URL,
    structuredClone,
    setTimeout: () => 0,
    clearTimeout() {},
    __confirmQueue: [],
    __promptQueue: [],
    __promptCount: 0,
    confirm: () => context.__confirmQueue.length ? context.__confirmQueue.shift() : true,
    prompt: () => { context.__promptCount++; return context.__promptQueue.length ? context.__promptQueue.shift() : '1'; },
    alert() {},
    fetch: fetchImpl || (async () => ({ok: true, text: async () => '{}', json: async () => ({})})),
    EventSource: class {},
    document: {
      activeElement: null,
      getElementById: element,
      querySelectorAll: () => [],
      querySelector: () => null,
      createElement: () => ({click() {}, style: {}}),
    },
    localStorage: {
      getItem: key => stored.has(key) ? stored.get(key) : null,
      setItem: (key, value) => stored.set(key, String(value)),
      removeItem: key => stored.delete(key),
    },
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.__bg3SummonRuntimeAudit;
}

const RUNTIME_ROWS = Object.freeze(TYPED_SOURCES.map(source => {
  const stackArg = source.args[4];
  const signature = RUNTIME_SIGNATURES[source.spellId];
  return Object.freeze({
    ...source,
    blueprintUuid: source.args[0].value,
    duration: source.args[1].value,
    requiresCanStand: source.canStand !== null,
    stackId: stackArg && ['string', 'symbol'].includes(stackArg.kind) ? stackArg.value : '',
    consumeItem: source.consume[0] === 'item',
    runtimeAllowed: source.runtimeAllowed !== false,
    spellLevel: signature.spellLevel,
    astSha256: signature.astSha256,
    argsSha256: signature.argsSha256,
  });
}));

function selectedBg3FileFetch() {
  return async url => {
    const relative = String(url || '').replace(/\\/g, '/').replace(/^\.\//, '');
    if (!relative.startsWith('data/bg3/') || relative.includes('..')) {
      return {ok: false, status: 404, text: async () => '', json: async () => ({})};
    }
    try {
      const raw = fs.readFileSync(repoFile(relative), 'utf8');
      return {ok: true, status: 200, text: async () => raw, json: async () => JSON.parse(raw)};
    } catch (_error) {
      return {ok: false, status: 404, text: async () => '', json: async () => ({})};
    }
  };
}

function hero(id, overrides = {}) {
  return {
    id, name: id, cls: 'Жрец', level: 5,
    ab: {str: 10, dex: 10, con: 10, int: 10, wis: 16, cha: 10},
    saves: {str: false, dex: false, con: false, int: false, wis: true, cha: false},
    skills: {}, hp: 10, hpMax: 10, hpTemp: 0, inventory: [], equipment: {}, abilities: [],
    activeFx: [], fxOff: [], cond: [], deaths: {s: 0, f: 0}, slots: {}, spentRest: 0,
    exhaustion: 0, hdUsed: 0, ...overrides,
  };
}

function testItemMechanics(lifecyclePrograms = []) {
  return {
    schemaVersion: 1, mode: 'structured', origin: 'explicit',
    activation: {cost: 'object'}, target: {kind: 'self', base: 1},
    duration: {kind: 'manual', label: 'test'},
    resolution: {schemaVersion: 2, inputPolicy: 'declared-results-only', attack: null,
      save: null, contest: null, rolls: [], threshold: '', thresholdCondition: '', needsRoll: false},
    effects: [], actions: [], interactions: [], resource: null,
    profile: {kind: 'misc', matchTokens: [], flags: {focus: false, componentPouch: false,
      magical: true, metal: false, proficiencyExempt: false, consumable: false, portable: true},
    mass: {kg: 0.1, display: '0.1 кг', unit: 'kg'},
    value: {gp: null, cp: null, display: ''}, roles: []},
    campaignRules: null, equipment: {slot: null, armorKind: null, metal: false,
      proficiencyExempt: false}, itemSpec: {attune: false, charges: null}, lifecyclePrograms,
  };
}

function summonBlockInterruptFixture() {
  const version = 'bg3-interrupt-summon-9919-v1';
  const symbolNode = value => ({kind: 'symbol', value});
  const integerNode = value => ({kind: 'integer', value});
  const itemId = 'bg3:item:rt:00000000-0000-0000-0000-000000009919';
  const artifact = 'rules/interrupts/aa.json';
  const refId = 'ref-interrupt-pipeline';
  const sourceId = 'source-interrupt-pipeline';
  const executionKey = 'execution-interrupt-pipeline';
  const interruptId = 'Summon_Block';
  const ruleId = `bg3:rule:interrupt:${interruptId}`;
  const programId = `${ruleId}:program:standard`;
  const ref = {id: refId, ruleId: 'bg3:rule:passive:pipeline-carrier',
    bg3Id: 'PASSIVE_PIPELINE_CARRIER', kind: 'passive', sourceField: 'Boosts', gate: 'equipped',
    programId: 'bg3:carrier:pipeline', artifact: 'rules/passives/aa.json', mode: 'typed',
    executionPolicy: 'preflight-fail-closed'};
  const properties = {field: 'Properties', role: 'consequences', raw: `effects ${interruptId}`,
    ast: {kind: 'sequence', items: []},
    bytecode: [{op: 'blockSpellCast', args: [], executable: true, phase: 'consequences'}],
    mode: 'typed', counts: {typedOpcodes: 1, manualOpcodes: 0}};
  const program = {schemaVersion: 'bg3-rule-program/1', id: programId, sourceRuleId: ruleId,
    sourceProfile: 'standard', executionModel: 'validate-commit-consequences',
    rollPolicy: 'player-input-required', localizedTextExecutable: false, mode: 'typed',
    fields: [properties]};
  const requiredRoles = ['activation-guard', 'enable-guard', 'resolution',
    'success-consequences', 'failure-consequences', 'consequences'];
  const projection = {schemaVersion: 'bg3-action-rule-projection/1',
    context: 'item-linked-interrupt', entrypoints: [{kind: 'interrupt', ruleId, bg3Id: interruptId,
      programId, artifact, roles: ['consequences'], requiredRoles, fields: ['Properties'], mode: 'typed'}],
    transitive: [], requiredRoles, unresolved: [], mode: 'typed', complete: true,
    executionPolicy: 'all-reachable-opcodes-or-fail-closed'};
  const descriptor = {schemaVersion: 'bg3-interrupt-projection/1',
    id: `descriptor-${interruptId}`, interruptId, ruleId, programId, artifact,
    sourceProfile: 'standard', carrier: {itemId, lifecycleRefId: refId, gate: 'equipped',
      sourceRuleId: ref.ruleId, sourceBg3Id: ref.bg3Id, sourceProgramId: ref.programId,
      sourceArtifact: ref.artifact, sourceField: 'Boosts', relation: 'unlock-interrupt',
      sourceApplicationId: sourceId, executionKey,
      unlockOpcode: {op: 'unlockInterrupt', field: 'Boosts', role: 'modifiers', preorderIndex: 0,
        args: [symbolNode(interruptId)], executable: true}},
    event: {raw: 'OnSpellCast', contexts: ['OnSpellCast'], scope: 'Self', container: 'YesNoDecision',
      defaultValue: {declared: true, raw: 'Ask;Enabled', tokens: ['Ask', 'Enabled']},
      enableContexts: {declared: false, raw: '', contexts: []}, complete: true},
    cost: {declared: true, raw: 'ReactionActionPoint:1', entries: [{resource: 'ReactionActionPoint',
      resourceRole: 'reaction', amount: integerNode(1), qualifiers: []}], mode: 'typed', complete: true},
    cooldown: {declared: false, raw: '', sourceKind: '', kind: 'none', itemScoped: false,
      complete: true}, commit: {cardinality: 'once-after-accepted-choice', consumeOwningItem: null,
      complete: true}, fields: {conditions: null, enableCondition: null, roll: null, success: null,
      failure: null, properties: {ruleId, programId, artifact, ...plain(properties)}},
    consequenceRefs: [], icon: {src: `assets/bg3/icons/${interruptId}.webp`, status: 'exact'},
    projection, mode: 'typed', complete: true, executable: true, blockers: [],
    executionPolicy: 'validate-player-choice-roll-single-commit-consequences'};
  ref.sourceApplication = {schemaVersion: 'bg3-lifecycle-source-expression/1', id: sourceId,
    executionKey, sourceField: 'Boosts', artifact: ref.artifact, role: 'modifiers', mode: 'typed',
    bytecode: [plain(descriptor.carrier.unlockOpcode)], executionCardinality: 'once-per-gate-transition',
    executionPolicy: 'all-opcodes-or-fail-closed'};
  ref.grantedInterrupts = [descriptor];
  const item = {id: itemId, n: 'Summon blocker reaction carrier', type: 'equipment', slot: 'HEAD',
    schemaVersion: 6, icon: {src: 'assets/bg3/icons/pipeline.webp'},
    mechanics: testItemMechanics([ref])};
  const payload = {schemaVersion: 'bg3-rule-definitions/1', catalogVersion: version,
    kind: 'interrupt', count: 1, rules: [{id: ruleId, bg3Id: interruptId,
      programs: {standard: program}}]};
  return {item, ref, descriptor, payload};
}

async function summonWorld({row = RUNTIME_ROWS[0], profile = 'standard', qty = 2, activeFx = [],
  extraActors = [], foes = [], combat = null, actorOverrides = {}} = {}) {
  let randomCalls = 0;
  const randomStacks = [];
  const engine = loadEngine(() => {
    randomCalls++;
    randomStacks.push(new Error('unexpected summon Math.random').stack);
    return 0.5;
  }, selectedBg3FileFetch());
  const entryId = 'summon-certificate-entry';
  const actor = hero('summon-certificate-user', {
    cls: 'Волшебник', level: 12,
    inventory: [{id: entryId, itemId: row.itemId, qty}],
    activeFx: plain(activeFx),
    ...actorOverrides,
  });
  actor.bg3ClassDescription = plain(engine.bg3WizardProfileBinding(''));
  actor.bg3ClassDescription.classLevel = actor.level;
  engine.setState({chars: [actor, ...extraActors], classes: engine.seedClassesDB(), foes,
    activeCharId: actor.id, fxRound: 7, combat: combat || undefined});
  assert.equal(engine.bg3CatalogUseRefs([{id: 'bg3', version: current.catalogVersion, profile,
    manifestSha256: current.manifestSha256}]), true);
  randomCalls = 0;
  randomStacks.length = 0;
  return {engine, actor, row, profile, entryId, useId: row.useIds[profile],
    randomCalls: () => randomCalls, randomStacks};
}

async function openSummon(world, {position = 'summon-world,1,2,3', canStand = true, prompts = null} = {}) {
  world.engine.setPromptResults(prompts || [position]);
  if (world.row.requiresCanStand) world.engine.setConfirmResults([canStand]);
  const opened = await world.engine.bg3ItemProgramOpen(world.entryId, world.actor.id, world.useId);
  return {opened, ctx: world.engine.castState().ctx};
}

async function prepareSummon(world) {
  const {engine, row, useId} = world;
  await engine.bg3CatalogEnsureIndex();
  await engine.bg3CatalogHydrate([row.itemId]);
  const item = engine.catalogItem(row.itemId);
  const use = engine.itemUseOf(item, useId);
  assert.ok(item);
  assert.ok(use);
  assert.ok(await engine.bg3RuleProgramPrepare(use));
  return {item, use};
}

function summonDiagnostic(world) {
  return JSON.stringify({audit: world.engine.bg3ItemSummonAudit(),
    error: world.engine.elementText('castErr'), status: world.engine.elementText('status')});
}

test('active v8 has 144 summon program profiles but exactly 20 typed and 14 mixed item carriers', () => {
  assert.equal(current.catalogVersion, EXPECTED.version);

  const summonPrograms = ruleProgramRecords.filter(record => record.summons.length > 0);
  assert.equal(summonPrograms.length, EXPECTED.summonProgramProfiles);
  assert.equal(new Set(summonPrograms.map(record => record.rule.id)).size, EXPECTED.summonRules);
  assert.equal(summonPrograms.reduce((sum, record) => sum + record.summons.length, 0),
    EXPECTED.summonOpcodeOccurrences);
  assert.equal([...programRecordsById.values()].every(records => records.length === 1), true,
    'a program id must resolve to one exact profile/rule/artifact');

  assert.equal(itemCarriers.length, EXPECTED.itemCarriers);
  assert.equal(new Set(itemCarriers.map(row => `${row.profile}\0${row.item.id}\0${row.use.id}`)).size,
    EXPECTED.itemCarriers);
  assert.equal(typedCarriers.length, EXPECTED.typedCarriers);
  assert.equal(mixedCarriers.length, EXPECTED.mixedCarriers);
  assert.deepEqual(Object.fromEntries(['standard', 'honour'].map(profile => [profile,
    typedCarriers.filter(row => row.profile === profile).length])), {standard: 10, honour: 10});
  assert.deepEqual(Object.fromEntries(['standard', 'honour'].map(profile => [profile,
    mixedCarriers.filter(row => row.profile === profile).length])), {standard: 7, honour: 7});
  assert.equal(new Set(typedCarriers.map(row => row.item.id)).size, 10);
  assert.equal(new Set(mixedCarriers.map(row => row.item.id)).size, 7);
  assert.equal(itemCarriers.every(row => row.use.handler === 'bg3RuleProgram'
    && row.spellIds.length === 1 && row.sources.length === 1), true);

  const readyItemOnSpellCastInterrupts = itemVariants.flatMap(variant =>
    (variant.mechanics?.lifecyclePrograms || []).flatMap(ref =>
      (ref?.grantedInterrupts || []).map(descriptor => ({variant, ref, descriptor}))))
    .filter(({descriptor}) => descriptor?.event?.contexts?.includes('OnSpellCast')
      && descriptor.schemaVersion === 'bg3-interrupt-projection/1'
      && descriptor.executable === true && descriptor.complete === true
      && descriptor.executionPolicy === 'validate-player-choice-roll-single-commit-consequences'
      && Array.isArray(descriptor.blockers) && descriptor.blockers.length === 0
      && descriptor.projection?.mode === 'typed' && descriptor.projection.complete === true
      && Array.isArray(descriptor.projection.unresolved) && descriptor.projection.unresolved.length === 0
      && descriptor.runtimeReady !== false && descriptor.sourceBlocked !== true);
  assert.equal(readyItemOnSpellCastInterrupts.length, EXPECTED.readyItemOnSpellCastInterrupts,
    'active v8 intentionally has no ready item-linked OnSpellCast interrupt composite');

  const actionTypes = rows => Object.fromEntries([...Map.groupBy(rows,
    row => +row.use.program.sourceAction.primary.actionType).entries()].sort(([a], [b]) => a - b)
    .map(([actionType, records]) => [actionType, records.length]));
  assert.deepEqual(actionTypes(itemCarriers), {12: 20, 32: 14});
  assert.deepEqual(actionTypes(typedCarriers), {12: 18, 32: 2});
  assert.deepEqual(actionTypes(mixedCarriers), {12: 2, 32: 12});
  assert.deepEqual(Object.fromEntries([...Map.groupBy(typedCarriers, row => row.use.target).entries()]
    .map(([target, records]) => [target, records.length])), {any: 12, creature: 8},
  'the generated target seam is pinned; a future runtime must privately replace it with ground');

  assert.deepEqual(typedCarriers.map(row => {
    const source = typedBySpell.get(row.spellIds[0]);
    return [row.profile, row.item.id, row.use.id, row.spellIds[0], row.itemShard,
      row.use.program.rootArtifact, row.sources[0].ref.artifact, source?.statsId || ''].join('|');
  }).sort((a, b) => a.localeCompare(b, 'en')), TYPED_SOURCES.flatMap(source => ['standard', 'honour'].map(profile =>
    [profile, source.itemId, source.useIds[profile], source.spellId, source.itemShard,
      source.rootArtifact, source.ruleArtifact, source.statsId].join('|'))).sort((a, b) => a.localeCompare(b, 'en')));

  assert.deepEqual(mixedCarriers.map(mixedCarrierLine).sort((a, b) => a.localeCompare(b, 'en')),
    MIXED_SOURCES.flatMap(source => ['standard', 'honour'].map(profile => expectedMixedLine(source, profile)))
      .sort((a, b) => a.localeCompare(b, 'en')));
  assert.equal(mixedCarriers.every(row => row.use.program.projection.mode === 'mixed'
    && row.use.program.projection.complete === false), true,
  'the 14 mixed carriers are exclusion fixtures, never an ambient summon unlock');
});

test('all 20 typed carriers bind exact item, action, root, rule, field and summon signatures', () => {
  const failures = [];
  for (const row of typedCarriers) {
    const checked = typedCarrierCheck(carrierTuple(row));
    if (!checked.ok) failures.push({profile: row.profile, itemId: row.item.id, useId: row.use.id,
      spellId: row.spellIds[0], failures: checked.failures});
  }
  assert.deepEqual(failures, []);

  const representative = typedCarriers.find(row => row.profile === 'standard'
    && row.spellIds[0] === 'Target_ArcaneEye');
  assert.ok(representative);
  const mutationCases = [
    ['profile', tuple => { tuple.profile = 'honour'; }],
    ['item id', tuple => { tuple.item.id += ':forged'; }],
    ['stats id', tuple => { tuple.item.source.statsId += '_Forged'; }],
    ['item shard', tuple => { tuple.itemShard = 'items/00-0000.json'; }],
    ['use id', tuple => { tuple.use.id += ':forged'; }],
    ['handler', tuple => { tuple.use.handler = 'bg3RootProgram'; }],
    ['cost', tuple => { tuple.use.cost = 'bonus'; }],
    ['generated target', tuple => { tuple.use.target = 'object'; }],
    ['consume kind', tuple => { tuple.use.consume.kind = 'none'; }],
    ['consume amount', tuple => { tuple.use.consume.amount = 2; }],
    ['root contract id', tuple => { tuple.use.program.id += ':forged'; }],
    ['root artifact', tuple => { tuple.use.program.rootArtifact = 'root-template-programs/00.json'; }],
    ['source action type', tuple => { tuple.use.program.sourceAction.primary.actionType = 32; }],
    ['source action trigger', tuple => { tuple.use.program.sourceAction.primary.trigger = 'OnUseActions'; }],
    ['rule program id', tuple => { tuple.use.program.ruleProgramId += ':forged'; }],
    ['rule artifact', tuple => { tuple.use.program.artifact = 'rules/spells/00.json'; }],
    ['projection profile', tuple => { tuple.use.program.projection.sourceProfile = 'honour'; }],
    ['projection context', tuple => { tuple.use.program.projection.context = 'generic'; }],
    ['projection mode', tuple => { tuple.use.program.projection.mode = 'mixed'; }],
    ['projection completeness', tuple => { tuple.use.program.projection.complete = false; }],
    ['projection policy', tuple => { tuple.use.program.projection.executionPolicy = 'partial'; }],
    ['projection unresolved', tuple => { tuple.use.program.projection.unresolved.push({kind: 'spell'}); }],
    ['entrypoint duplicate', tuple => { tuple.use.program.projection.entrypoints.push(plain(tuple.use.program.projection.entrypoints[0])); }],
    ['entrypoint field', tuple => { tuple.source.ref.fields[0] = 'SpellSuccess'; }],
    ['entrypoint role', tuple => { tuple.source.ref.roles[0] = 'success-consequences'; }],
    ['entrypoint bg3 id', tuple => { tuple.source.ref.bg3Id += '_Forged'; }],
    ['entrypoint program', tuple => { tuple.source.ref.programId += ':forged'; }],
    ['entrypoint artifact', tuple => { tuple.source.ref.artifact = 'rules/spells/00.json'; }],
    ['entrypoint profile', tuple => { tuple.source.ref.sourceProfile = 'honour'; }],
    ['root identity', tuple => { tuple.root.id += ':forged'; }],
    ['root action type', tuple => { tuple.root.actionType = 32; }],
    ['root commit cost', tuple => { tuple.root.commit[0].binding.cost = 'bonus'; }],
    ['root commit consume', tuple => { tuple.root.commit[0].binding.consume.amount = 2; }],
    ['root invoke program', tuple => { tuple.root.consequences[0].programId += ':forged'; }],
    ['loaded artifact', tuple => { tuple.source.artifact = 'rules/spells/00.json'; }],
    ['rule identity', tuple => { tuple.source.rule.id += ':forged'; }],
    ['program identity', tuple => { tuple.source.program.id += ':forged'; }],
    ['spell flags', tuple => { tuple.source.rule.properties.SpellFlags = 'IsSpell'; }],
    ['spell level', tuple => { tuple.source.rule.properties.Level = 9; }],
    ['field raw', tuple => { tuple.source.program.fields.find(field => field.field === 'SpellProperties').raw += ' '; }],
    ['field ast', tuple => { tuple.source.program.fields.find(field => field.field === 'SpellProperties').ast.forged = true; }],
    ['opcode extra key', tuple => { tuple.source.program.fields.find(field => field.field === 'SpellProperties').bytecode[0].forged = true; }],
    ['opcode functor', tuple => { tuple.source.program.fields.find(field => field.field === 'SpellProperties').bytecode[0].bg3Functor = 'Spawn'; }],
    ['opcode phase', tuple => { tuple.source.program.fields.find(field => field.field === 'SpellProperties').bytecode[0].phase = 'commit'; }],
    ['opcode scope', tuple => { tuple.source.program.fields.find(field => field.field === 'SpellProperties').bytecode[0].scope = 'TARGET'; }],
    ['opcode policy', tuple => { tuple.source.program.fields.find(field => field.field === 'SpellProperties').bytecode[0].scopePolicy = 'skip-non-player'; }],
    ['summon uuid', tuple => { tuple.source.program.fields.find(field => field.field === 'SpellProperties').bytecode[0].args[0].value = '00000000-0000-0000-0000-000000000000'; }],
    ['summon duration', tuple => { tuple.source.program.fields.find(field => field.field === 'SpellProperties').bytecode[0].args[1].value = 99; }],
    ['can stand uuid', tuple => { tuple.source.program.fields.find(field => field.field === 'TargetConditions').bytecode[0].condition.args[0].value = '00000000-0000-0000-0000-000000000000'; }],
  ];

  for (const [label, mutate] of mutationCases) {
    const tuple = plain(carrierTuple(representative));
    mutate(tuple);
    const checked = typedCarrierCheck(tuple);
    assert.equal(checked.ok, false, `${label}: ${checked.failures.join(', ')}`);
  }
});

test('CanStand, malformed Scrying, AI scopes and adjacent consequences stay source-exact', () => {
  const checked = typedCarriers.map(row => ({row, result: typedCarrierCheck(carrierTuple(row))}));
  const withCanStand = checked.filter(entry => entry.result.canStand.length > 0);
  const matching = withCanStand.filter(entry => entry.result.canStand[0].args[0].value
    === entry.result.summon.args[0].value);
  const mismatching = withCanStand.filter(entry => entry.result.canStand[0].args[0].value
    !== entry.result.summon.args[0].value);
  assert.equal(withCanStand.length, EXPECTED.canStandCarriers);
  assert.equal(matching.length, EXPECTED.matchingCanStandCarriers);
  assert.equal(mismatching.length, EXPECTED.scryMismatchCarriers);
  assert.equal(new Set(mismatching.map(entry => entry.row.spellIds[0])).size, 1);
  assert.deepEqual(mismatching.map(entry => ({
    profile: entry.row.profile,
    spellId: entry.row.spellIds[0],
    canStand: entry.result.canStand[0].args[0].value,
    summon: entry.result.summon.args[0].value,
  })).sort((a, b) => a.profile.localeCompare(b.profile, 'en')), [
    {profile: 'honour', spellId: 'Target_Scrying', canStand: '58450a22f414df9a9fd8-c7c9-4419-955d-', summon: '2f83206a-13c3-4ecb-a599-f6aa4708e149'},
    {profile: 'standard', spellId: 'Target_Scrying', canStand: '58450a22f414df9a9fd8-c7c9-4419-955d-', summon: '2f83206a-13c3-4ecb-a599-f6aa4708e149'},
  ]);

  for (const profile of ['standard', 'honour']) {
    const cloud = typedCarriers.find(row => row.profile === profile && row.spellIds[0] === 'Target_CloudOfDaggers');
    const cloudField = cloud.sources[0].fields.find(field => field.field === 'SpellProperties');
    assert.equal(cloudField.ast.kind, 'sequence');
    assert.deepEqual(cloudField.ast.items.map(item => [item.scope, item.statement.scope, item.statement.statement?.name || item.statement.name]), [
      ['AI_IGNORE', 'GROUND', 'Summon'],
      ['AI_ONLY', undefined, 'DealDamage'],
    ]);
    assert.deepEqual(cloudField.bytecode.map(opcode => [opcode.op, opcode.scope, opcode.scopePolicy]), [
      ['summon', 'AI_IGNORE', 'execute-player'],
      ['dealDamage', 'AI_ONLY', 'skip-non-player'],
    ]);

    const seelie = typedCarriers.find(row => row.profile === profile && row.spellIds[0] === 'Target_CursedTome_Seelie_Summon');
    const seelieField = seelie.sources[0].fields.find(field => field.field === 'SpellProperties');
    assert.equal(seelieField.ast.kind, 'sequence');
    assert.deepEqual(seelieField.ast.items.map(item => [item.scope, item.statement.scope, item.statement.statement.name]), [
      ['AI_IGNORE', 'Ground', 'Summon'],
      ['AI_ONLY', 'Ground', 'Summon'],
    ]);
    assert.deepEqual(seelieField.bytecode.map(opcode => [opcode.op, opcode.scope, opcode.scopePolicy]), [
      ['summon', 'AI_IGNORE', 'execute-player'],
      ['summon', 'AI_ONLY', 'skip-non-player'],
    ]);
    assert.deepEqual(seelieField.bytecode[1].args.slice(-3), [
      symbol('UNSUMMON_ABLE'),
      symbol('SHADOWCURSE_SUMMON_CHECK'),
      symbol('KNOCKED_OUT_SUMMON_DISMISS'),
    ]);

    const sleet = typedCarriers.find(row => row.profile === profile && row.spellIds[0] === 'Target_SleetStorm');
    const sleetField = sleet.sources[0].fields.find(field => field.field === 'SpellProperties');
    assert.deepEqual(sleetField.bytecode.map(opcode => [opcode.op, opcode.scope || '', opcode.scopePolicy || '']), [
      ['summon', 'GROUND', 'execute-player'],
      ['removeStatus', '', ''],
    ]);
    assert.equal(sleetField.bytecode[1].status.value, 'BURNING');
    assert.equal(sleetField.bytecode[1].target.value, 'TARGET');
  }

  const spider = mixedCarriers.filter(row => row.spellIds[0] === 'Projectile_SpiderlingSpawning');
  const quasit = mixedCarriers.filter(row => row.spellIds[0] === 'Target_FOR_ThayanCellar_SummonQuasit');
  assert.equal(spider.length, 12);
  assert.equal(quasit.length, 2);
  assert.equal(spider.every(row => row.sources[0].summons.length === 5
    && row.sources[0].record.program.fields.some(field => field.field === 'SpellRoll'
      && field.bytecode.some(opcode => opcode.op === 'manual' && opcode.reason === 'unsupported-resolution'))), true);
  assert.equal(quasit.every(row => row.sources[0].summons.length === 1
    && row.sources[0].summons[0].args[1].kind === 'symbol'
    && row.sources[0].summons[0].args[1].value === 'Permanent'
    && row.sources[0].record.program.fields.some(field => field.field === 'RequirementConditions'
      && field.bytecode.some(opcode => opcode.op === 'manual' && opcode.reason === 'unsupported-condition'))), true);
});

test('the 10 ready summon-bearing A33 rows are learning records, not item summon carriers', () => {
  assert.equal(typedA33Rows.length, EXPECTED.physicalTypedA33);
  assert.equal(new Set(typedA33Rows.map(row => row.spellId)).size, 6);
  assert.equal(typedA33Rows.every(row => row.use.handler === 'bg3LearnSpellProgram'
    && +row.use.program.sourceAction.primary.actionType === 33
    && row.use.program.special?.kind === 'bg3LearnSpell'
    && row.root && row.rule && row.program), true);

  const ready = typedA33Rows.filter(row => row.mode === 'typed' && row.condition === '');
  const blocked = typedA33Rows.filter(row => !(row.mode === 'typed' && row.condition === ''));
  assert.equal(ready.length, EXPECTED.readyTypedA33);
  assert.equal(blocked.length, 2);
  assert.equal(digestRows(ready, a33DigestLine), EXPECTED.readyTypedA33Sha256);
  assert.deepEqual(new Set(ready.map(row => row.spellId)), new Set([
    'Target_ArcaneEye',
    'Target_CursedTome_Seelie_Summon',
    'Target_FlamingSphere',
    'Target_GlobeOfInvulnerability',
    'Target_SleetStorm',
  ]));
  assert.deepEqual(blocked.map(row => [row.profile, row.actionId, row.spellId, row.condition]), [
    ['honour', 'bg3-use-a290b6a66243c422a658', 'Target_CloudOfDaggers', 'CanUseSpellScroll("Target_CloudOfDaggers")'],
    ['standard', 'bg3-use-18e02dc9e4f43fa2ad22', 'Target_CloudOfDaggers', 'CanUseSpellScroll("Target_CloudOfDaggers")'],
  ]);

  const expectedReadyActionIds = TYPED_SOURCES.flatMap(source => source.a33UseIds
    ? ['standard', 'honour'].map(profile => source.a33UseIds[profile]) : []);
  assert.deepEqual(ready.map(row => row.actionId).sort(), expectedReadyActionIds.sort());
  const expectedBlockedActionIds = TYPED_SOURCES.flatMap(source => source.blockedA33UseIds
    ? ['standard', 'honour'].map(profile => source.blockedA33UseIds[profile]) : []);
  assert.deepEqual(blocked.map(row => row.actionId).sort(), expectedBlockedActionIds.sort());
  assert.equal(ready.every(row => !itemCarriers.some(carrier => carrier.use === row.use)), true,
    'A33 learning actions must never be counted as A12/A32 summon runtime carriers');
});

test('compiler admits the exact 20 typed Summon carriers while public CanStand and all 14 mixed carriers stay closed', () => {
  const engine = loadEngine();
  assert.equal(engine.typedFamily('summon'), true);

  const canStand = {kind: 'predicate', name: 'CanStand', args: [string('2f83206a-13c3-4ecb-a599-f6aa4708e149')]};
  assert.equal(engine.guardSupported(canStand), false);
  let targetReads = 0;
  const untrustedTarget = new Proxy({}, {
    get() { targetReads++; throw new Error('unsupported CanStand must not read a public target'); },
    getOwnPropertyDescriptor() { targetReads++; throw new Error('unsupported CanStand must not inspect a public target'); },
    ownKeys() { targetReads++; throw new Error('unsupported CanStand must not enumerate a public target'); },
  });
  assert.deepEqual(plain(engine.guardResult(canStand, {id: 'caster'}, untrustedTarget, null)),
    {known: false, value: false});
  assert.equal(targetReads, 0);

  for (const row of typedCarriers) {
    const tuple = carrierTuple(row);
    const expected = RUNTIME_ROWS.find(source => source.spellId === row.spellIds[0]);
    const use = plain(tuple.use), root = plain(tuple.root), programs = plain(programsForTuple(tuple));
    const before = canonical({use, root, programs});
    engine.setProfile(tuple.profile);
    const plan = plain(engine.compile(use, root, programs));
    const label = `${tuple.profile}/${tuple.item.id}/${tuple.use.id}`;
    assert.equal(canonical({use, root, programs}), before, `${label}: compile mutation`);
    assert.equal(plan.ok, true, `${label}: ${engine.report(plan)}`);
    assert.deepEqual(plan.issues, [], label);
    const summons = (plan.ops || []).filter(opcode => opcode.op === 'summon');
    assert.equal(summons.length, 1, label);
    const summon = summons[0];
    assert.equal(summon.blueprintUuid, expected.blueprintUuid, label);
    assert.equal(summon.duration, expected.duration, label);
    assert.equal(summon.scope, expected.scope, label);
    assert.equal(summon.sourceRaw, expected.raw, label);
    assert.equal(summon.sourceAstSha256, expected.astSha256, label);
    assert.equal(sha256(canonical(summon.args)), expected.argsSha256, label);
    assert.equal(summon.sourceProfile, tuple.profile, label);
    assert.equal(summon.sourceRuleId, expected.ruleId, label);
    assert.equal(summon.sourceBg3Id, expected.spellId, label);
    const canStandGuards = (plan.guards || []).filter(guard => guard.privateTypedItemGuard === 'CanStand');
    assert.equal(canStandGuards.length, expected.requiresCanStand ? 1 : 0, label);
    if (expected.requiresCanStand) assert.equal(canStandGuards[0].templateUuid, expected.canStand, label);
  }

  for (const row of mixedCarriers) {
    const tuple = carrierTuple(row);
    const use = plain(tuple.use), root = plain(tuple.root), programs = plain(programsForTuple(tuple));
    const before = canonical({use, root, programs});
    engine.setProfile(tuple.profile);
    const plan = plain(engine.compile(use, root, programs));
    const label = `${tuple.profile}/${tuple.item.id}/${tuple.use.id}`;
    assert.equal(canonical({use, root, programs}), before, `${label}: compile mutation`);
    assert.equal(plan.ok, false, label);
    assert.equal((plan.ops || []).some(opcode => opcode.op === 'summon'), false, label);
  }
});

test('private runtime commits exactly 18/20 typed carriers with exact overlays and denies both malformed Scrying rows', async () => {
  let committed = 0, blocked = 0;
  const durations = new Set();
  const stacks = new Set();
  for (const profile of ['standard', 'honour']) for (const row of RUNTIME_ROWS) {
    const label = `${profile}/${row.spellId}`;
    const world = await summonWorld({row, profile});
    const {engine, actor, randomCalls, randomStacks} = world;
    const before = plain({actor, chars: engine.state().chars, foes: engine.state().foesDB,
      combat: engine.state().combat});
    const opened = await openSummon(world, {position: 'matrix-world,10,20,30', canStand: true});
    if (!row.runtimeAllowed) {
      assert.equal(opened.opened, false, label);
      assert.equal(engine.promptCount(), 0, `${label}: Scry must fail before placement`);
      assert.equal(engine.bg3ItemSummonAudit(), null, label);
      assert.deepEqual(plain({actor, chars: engine.state().chars, foes: engine.state().foesDB,
        combat: engine.state().combat}), before, `${label}: denied carrier mutated world`);
      assert.equal(randomCalls(), 0, label);
      blocked++;
      continue;
    }

    assert.equal(opened.opened, true, `${label}: ${summonDiagnostic(world)}`);
    assert.equal(opened.ctx.target, 'ground', label);
    assert.equal(Object.prototype.hasOwnProperty.call(opened.ctx, 'position'), false,
      `${label}: position leaked into public cast context`);
    const randomBefore = randomCalls();
    assert.equal(engine.castConfirm(), true, `${label}: ${summonDiagnostic(world)}`);
    assert.equal(randomCalls(), randomBefore,
      `${label}: commit rolled\n${randomStacks.slice(randomBefore).join('\n---\n')}`);
    assert.equal(engine.state().chars.length, 1, `${label}: summon created an actor record`);
    assert.equal(engine.state().foesDB.length, 0, `${label}: summon created an NPC record`);
    const overlays = actor.activeFx.filter(effect => effect.k === 'bg3-summon');
    assert.equal(overlays.length, 1, `${label}: player/AI branch cardinality`);
    const overlay = overlays[0];
    assert.equal(overlay.id, row.spellId, label);
    assert.equal(overlay.casterId, actor.id, label);
    assert.equal(overlay.conc, row.concentration, label);
    assert.equal(overlay.stackKey, row.stackId ? `bg3-summon:${row.stackId}` : '', label);
    assert.equal(overlay.bg3Summon.schemaVersion, 'bg3-item-summon-overlay/1', label);
    assert.equal(overlay.bg3Summon.blueprintUuid, row.blueprintUuid, label);
    assert.equal(overlay.bg3Summon.sourceSpellId, row.spellId, label);
    assert.equal(overlay.bg3Summon.sourceRuleId, row.ruleId, label);
    assert.equal(overlay.bg3Summon.sourceProfile, profile, label);
    assert.equal(overlay.bg3Summon.sourceScope, row.scope, label);
    assert.equal(overlay.bg3Summon.sourceRaw, row.raw, label);
    assert.equal(overlay.bg3Summon.sourceAstSha256, row.astSha256, label);
    assert.equal(sha256(canonical(overlay.bg3Summon.sourceArgs)), row.argsSha256, label);
    assert.equal(overlay.bg3Summon.sourceItemId, row.itemId, label);
    assert.equal(overlay.bg3Summon.sourceItemUseId, row.useIds[profile], label);
    assert.equal(overlay.bg3Summon.sourceInventoryEntryId, world.entryId, label);
    assert.equal(overlay.bg3Summon.duration, row.duration, label);
    assert.equal(overlay.bg3Summon.stackId, row.stackId, label);
    assert.equal(overlay.bg3Summon.concentration, row.concentration, label);
    assert.deepEqual(plain(overlay.bg3Summon.worldPosition), {
      kind: 'position', coordinateSpace: 'world', worldId: 'matrix-world', x: 10, y: 20, z: 30,
    }, label);
    assert.equal(overlay.bg3Summon.canStandProof !== null, row.requiresCanStand, label);
    if (row.requiresCanStand) {
      assert.equal(overlay.bg3Summon.canStandProof.kind, 'trusted-gm-can-stand/1', label);
      assert.equal(overlay.bg3Summon.canStandProof.templateUuid, row.blueprintUuid, label);
      assert.equal(overlay.bg3Summon.canStandProof.profile, profile, label);
    }
    assert.equal(actor.inventory[0].qty, row.consumeItem ? 1 : 2, `${label}: item resource`);
    if (row.duration === -1) {
      assert.equal(overlay.durationKind, 'manual', label);
      assert.equal(overlay.manualDismiss, true, label);
      assert.equal(Object.prototype.hasOwnProperty.call(overlay, 'expiresAtRound'), false, label);
    } else {
      assert.equal(overlay.durationKind, 'rounds', label);
      assert.equal(overlay.expiresAtRound, 7 + row.duration, label);
    }
    assert.deepEqual(plain(engine.bg3ItemSummonAudit()), {phase: 'used', itemId: row.itemId,
      useId: row.useIds[profile], spellId: row.spellId, profile, reason: '', resourceTransactions: 1}, label);
    durations.add(row.duration);
    if (row.stackId) stacks.add(row.stackId);
    committed++;
  }
  assert.equal(committed, 18);
  assert.equal(blocked, 2);
  assert.deepEqual([...durations].sort((a, b) => a - b), [-1, 3, 10, 100]);
  assert.deepEqual([...stacks].sort(), ['IntellectDevourStack', 'PlanarAllyStack', 'SleetStorm', 'SummonHusband']);
});

test('all 14 mixed real-v8 item carriers fail before placement and payment', async () => {
  let blocked = 0;
  for (const profile of ['standard', 'honour']) for (const row of MIXED_SOURCES) {
    const world = await summonWorld({row, profile});
    const before = plain(world.engine.worldSnapshot());
    const opened = await openSummon(world, {position: 'mixed-must-not-prompt,1,2,3'});
    const label = `${profile}/${row.itemId}`;
    assert.equal(opened.opened, false, label);
    assert.equal(world.engine.promptCount(), 0, label);
    assert.equal(world.engine.bg3ItemSummonAudit(), null, label);
    assert.deepEqual(plain(world.engine.worldSnapshot()), before, label);
    assert.equal(world.randomCalls(), 0, label);
    blocked++;
  }
  assert.equal(blocked, 14);
});

test('A33 learns provenance without an overlay and learned Summon remains item-authority fail-closed', async () => {
  const row = typedA33Rows.find(candidate => candidate.profile === 'standard'
    && candidate.spellId === 'Target_ArcaneEye' && candidate.mode === 'typed' && candidate.condition === '');
  assert.ok(row);
  let randomCalls = 0;
  const engine = loadEngine(() => { randomCalls++; return 0.5; }, selectedBg3FileFetch());
  const entryId = 'summon-a33-entry';
  const actor = hero('summon-a33-wizard', {cls: 'Волшебник', level: 12,
    bg3LearnedSpells: [], spellbook: [], coins: {mm: 0, sm: 0, em: 0, zm: 1000000, pm: 0},
    inventory: [{id: entryId, itemId: row.itemId, qty: 1}]});
  actor.bg3ClassDescription = plain(engine.bg3WizardProfileBinding(''));
  actor.bg3ClassDescription.classLevel = 12;
  engine.setState({chars: [actor], classes: engine.seedClassesDB(), activeCharId: actor.id});
  assert.equal(engine.bg3CatalogUseRefs([{id: 'bg3', version: current.catalogVersion,
    profile: row.profile, manifestSha256: current.manifestSha256}]), true);
  await engine.bg3CatalogEnsureIndex();
  await engine.bg3CatalogHydrate([row.itemId]);
  randomCalls = 0;

  const plan = await engine.bg3LearnSpellPlanFor(actor, entryId, row.actionId);
  assert.equal(plan.ok, true, plan.reason);
  const committed = await engine.bg3LearnSpellCommit(plan);
  assert.equal(committed.ok, true, committed.reason);
  assert.equal(actor.activeFx.some(effect => effect.k === 'bg3-summon'), false);
  assert.equal(actor.inventory.some(entry => entry.id === entryId), false, 'A33 consumes its source scroll');
  assert.equal(actor.bg3LearnedSpells.length, 1);
  assert.equal(actor.bg3LearnedSpells[0].spellId, row.spellId);
  const learned = actor.bg3LearnedSpells[0];
  const beforeCast = plain({slots: actor.slots, activeFx: actor.activeFx,
    inventory: actor.inventory, learned: actor.bg3LearnedSpells});
  const prepared = await engine.bg3LearnedSpellPrepare(actor, learned.id);
  assert.equal(prepared.ok, false, 'learned preparation must not borrow item-only Summon authority');
  assert.match(prepared.reason, /typed-item-opcode|private-can-stand|fail-closed/i);
  const applied = await engine.bg3LearnedSpellApply(actor.id, learned.id, 'object', null);
  assert.equal(applied.ok, false);
  assert.deepEqual(plain({slots: actor.slots, activeFx: actor.activeFx,
    inventory: actor.inventory, learned: actor.bg3LearnedSpells}), beforeCast);
  assert.equal(actor.activeFx.some(effect => effect.k === 'bg3-summon'), false);
  assert.equal(randomCalls, 0);
});

test('private placement requires a finite position and a same-template CanStand attestation', async () => {
  for (const position of ['position-world,1,2', 'position-world,NaN,2,3', ',1,2,3']) {
    const world = await summonWorld();
    const before = plain(world.engine.worldSnapshot());
    const opened = await openSummon(world, {position});
    assert.equal(opened.opened, false, position);
    assert.equal(world.engine.promptCount(), 1, position);
    assert.equal(world.engine.bg3ItemSummonAudit(), null, position);
    assert.deepEqual(plain(world.engine.worldSnapshot()), before, position);
    assert.equal(world.randomCalls(), 0, position);
  }

  const row = RUNTIME_ROWS.find(source => source.spellId === 'Target_HAG_Hagspawn_SummonHusband');
  const denied = await summonWorld({row});
  const before = plain(denied.engine.worldSnapshot());
  const opened = await openSummon(denied, {position: 'can-stand-world,4,5,6', canStand: false});
  assert.equal(opened.opened, false);
  assert.equal(denied.engine.promptCount(), 1);
  assert.equal(denied.engine.bg3ItemSummonAudit(), null);
  assert.equal(denied.engine.castState().ctx, null);
  assert.deepEqual(plain(denied.engine.worldSnapshot()), before);
  assert.equal(denied.randomCalls(), 0);
});

test('issued summon proof rejects public position, detached carriers and hostile inputs without mutation', async () => {
  const world = await summonWorld();
  const {engine, actor, entryId, useId, randomCalls, randomStacks} = world;
  const other = hero('summon-proof-other');
  const opened = await openSummon(world, {position: 'proof-world,1,2,3'});
  engine.state().chars.push(other);
  assert.equal(opened.opened, true, summonDiagnostic(world));
  engine.captureNextDispatch(true);
  assert.equal(engine.castConfirm(), false);
  const args = engine.lastDispatch();
  const carrier = args?.[3];
  assert.ok(carrier);
  assert.equal(engine.bg3ItemSummonAudit().phase, 'issued');
  const before = plain({actor, other, combat: engine.state().combat});

  assert.equal(engine.applyArgs(['wrong-entry', args[1], args[2], carrier, args[4]]), false);
  assert.equal(engine.applyArgs([args[0], 'wrong-caster', args[2], carrier, args[4]]), false);
  assert.equal(engine.applyArgs([args[0], args[1], `ally:${other.id}`, carrier, args[4]]), false);
  assert.equal(engine.applyArgs([args[0], args[1], args[2], carrier, 'wrong-use']), false);
  assert.equal(engine.applyArgs([args[0], args[1], args[2], Object.assign({}, carrier), args[4]]), false);

  let carrierHits = 0;
  const carrierProxy = new Proxy(carrier, {
    get() { carrierHits++; throw new Error('detached carrier getter'); },
    getOwnPropertyDescriptor() { carrierHits++; throw new Error('detached carrier descriptor'); },
    ownKeys() { carrierHits++; throw new Error('detached carrier ownKeys'); },
  });
  assert.equal(engine.applyArgs([args[0], args[1], args[2], carrierProxy, args[4]]), false);
  assert.equal(carrierHits, 0);

  let optsHits = 0;
  const optsProxy = new Proxy({}, {
    get() { optsHits++; throw new Error('public opts getter'); },
    ownKeys() { optsHits++; throw new Error('public opts ownKeys'); },
  });
  assert.equal(engine.applyArgs([args[0], args[1], args[2], carrier, args[4], optsProxy]), false);
  assert.equal(optsHits, 0);

  opened.ctx.position = {kind: 'position', coordinateSpace: 'world', worldId: 'forged', x: 9, y: 9, z: 9};
  assert.equal(engine.applyArgs(args), false, 'a public position must not become authority');
  delete opened.ctx.position;
  actor.hp++;
  assert.equal(engine.applyArgs(args), false, 'post-issue actor changes must make the proof stale');
  actor.hp--;
  assert.deepEqual(plain({actor, other, combat: engine.state().combat}), before);

  const hostileKeys = ['commitItemUseResource', 'itemSpendOne', 'bg3InterruptCastFinish', 'fxInvalidate',
    'renderChars', 'renderFoes', 'renderCombat', 'setStatus'];
  const poisons = hostileKeys.map(key => [key, engine.poisonGlobal(key, actor)]);
  const randomBefore = randomCalls();
  let committedWithCapturedIntrinsics;
  try { committedWithCapturedIntrinsics = engine.applyArgs(args); }
  finally { for (let index = poisons.length - 1; index >= 0; index--) poisons[index][1].restore(); }
  assert.equal(committedWithCapturedIntrinsics, true, summonDiagnostic(world));
  for (const [key, poison] of poisons) assert.equal(poison.hits(), 0,
    `${key}: private commit must not read ambient global accessors`);
  assert.notEqual(actor.notes, 'global-accessor-fired');
  assert.equal(actor.inventory.find(entry => entry.id === entryId).qty, 1);
  const overlay = actor.activeFx.find(effect => effect.k === 'bg3-summon');
  assert.ok(overlay);
  assert.deepEqual(plain(overlay.bg3Summon.worldPosition), {
    kind: 'position', coordinateSpace: 'world', worldId: 'proof-world', x: 1, y: 2, z: 3,
  });
  const committed = plain({actor, other, combat: engine.state().combat});
  assert.equal(engine.applyArgs(args), false, 'proof replay must be terminal');
  assert.deepEqual(plain({actor, other, combat: engine.state().combat}), committed);
  assert.equal(engine.bg3ItemSummonAudit().phase, 'replay-rejected');
  assert.equal(randomCalls(), randomBefore,
    `tamper rejection and restored commit rolled\n${randomStacks.slice(randomBefore).join('\n---\n')}`);
});

test('noncombat summon rollback preserves object identities and the issued proof remains retryable exactly once', async () => {
  const sentinel = {uid: 'summon-rollback-sentinel', k: 'test', id: 'sentinel', label: 'sentinel',
    casterId: 'other', conc: false, stackKey: '', fx: [], mechanicsVersion: 1, effectSchemaVersion: 1};
  const world = await summonWorld({activeFx: [sentinel]});
  const {engine, actor, randomCalls, randomStacks} = world;
  const opened = await openSummon(world, {position: 'rollback-world,7,8,9'});
  assert.equal(opened.opened, true, summonDiagnostic(world));
  engine.captureNextDispatch(true);
  assert.equal(engine.castConfirm(), false);
  const args = engine.lastDispatch();
  assert.ok(args);
  const state = engine.state();
  const refs = {chars: state.chars, actor, inventory: actor.inventory, entry: actor.inventory[0],
    activeFx: actor.activeFx, sentinel: actor.activeFx[0]};
  const before = plain(engine.worldSnapshot());
  const randomBefore = randomCalls();
  engine.bg3ItemSummonTestInjectLateFailureOnce();
  assert.equal(engine.applyArgs(args), false, 'injected late failure must roll back the whole transaction');
  assert.deepEqual(plain(engine.worldSnapshot()), before);
  assert.equal(engine.state().chars, refs.chars);
  assert.equal(engine.state().chars[0], refs.actor);
  assert.equal(actor.inventory, refs.inventory);
  assert.equal(actor.inventory[0], refs.entry);
  assert.equal(actor.activeFx, refs.activeFx);
  assert.equal(actor.activeFx[0], refs.sentinel);
  assert.equal(engine.bg3ItemSummonAudit().phase, 'rolled-back');

  assert.equal(engine.applyArgs(args), true, summonDiagnostic(world));
  assert.equal(actor.inventory[0].qty, 1);
  assert.equal(actor.activeFx.filter(effect => effect.k === 'bg3-summon').length, 1);
  const committed = plain(engine.worldSnapshot());
  assert.equal(engine.applyArgs(args), false);
  assert.deepEqual(plain(engine.worldSnapshot()), committed);
  assert.equal(engine.bg3ItemSummonAudit().phase, 'replay-rejected');
  assert.equal(randomCalls(), randomBefore,
    `rollback/retry/replay rolled\n${randomStacks.slice(randomBefore).join('\n---\n')}`);
});

test('combat summon spends one action and one scroll atomically, preserves live arrays, rolls back and rejects replay', async () => {
  const row = RUNTIME_ROWS.find(source => source.spellId === 'Target_ArcaneEye');
  const world = await summonWorld({row});
  const {engine, actor, entryId, useId, randomCalls, randomStacks} = world;
  await prepareSummon(world);
  const foe = plain(engine.seedFoesDB()[0]);
  engine.state().foesDB.push(foe);
  assert.equal(engine.combatStart([{kind: 'ally', id: actor.id, nat: 20},
    {kind: 'foe', id: foe.id, nat: 1}], 'summon certificate combat'), true);

  const stale = {kind: 'spell', spellId: 'stale-spell', combatActorKey: 'sentinel',
    combatCost: 'bonus', combatLabel: 'sentinel', combatCommitted: true};
  engine.setCastContext(stale);
  engine.setPromptResults([null]);
  const cancelledBefore = plain({actor, turn: engine.state().combat.turn});
  assert.equal(engine.combatUseItem(entryId, useId), false);
  assert.equal(engine.castState().ctx, stale);
  assert.deepEqual(plain({actor, turn: engine.state().combat.turn}), cancelledBefore);
  engine.setCastContext(null);

  engine.setPromptResults(['combat-summon-world,4,5,6']);
  engine.setConfirmResults([true]);
  assert.equal(engine.combatUseItem(entryId, useId), true, summonDiagnostic(world));
  const ctx = engine.castState().ctx;
  assert.equal(ctx.target, 'ground');
  assert.equal(ctx.combatActorKey, `ally:${actor.id}`);
  assert.equal(ctx.combatCost, 'action');
  assert.equal(ctx.combatCommitted, false);
  assert.equal(Object.prototype.hasOwnProperty.call(ctx, 'position'), false);
  engine.captureNextDispatch(true);
  assert.equal(engine.castConfirm(), false);
  const args = engine.lastDispatch();
  assert.ok(args);
  assert.equal(engine.bg3ItemSummonAudit().phase, 'issued');
  const proofIssuedAtCeiling = Date.now();

  const combat = engine.state().combat;
  const turn = combat.turn;
  assert.equal(turn.actionsUsed, 0);
  const refs = {combat, turn, log: combat.log, spellCasts: turn.spellCasts,
    inventory: actor.inventory, entry: actor.inventory[0], activeFx: actor.activeFx};
  turn.actionsUsed = 1;
  assert.equal(engine.applyArgs(args), false, 'stale action state must reject before payment');
  turn.actionsUsed = 0;
  const before = plain(engine.worldSnapshot());
  const randomBefore = randomCalls();
  engine.bg3ItemSummonTestInjectLateFailureOnce();
  assert.equal(engine.applyArgs(args), false, 'late combat failure must roll back action, scroll and overlay');
  assert.deepEqual(plain(engine.worldSnapshot()), before);
  assert.equal(engine.state().combat, refs.combat);
  assert.equal(engine.state().combat.turn, refs.turn);
  assert.equal(engine.state().combat.log, refs.log);
  assert.equal(engine.state().combat.turn.spellCasts, refs.spellCasts);
  assert.equal(actor.inventory, refs.inventory);
  assert.equal(actor.inventory[0], refs.entry);
  assert.equal(actor.activeFx, refs.activeFx);
  assert.equal(engine.bg3ItemSummonAudit().phase, 'rolled-back');

  assert.equal(engine.applyArgs(args), true, summonDiagnostic(world));
  assert.equal(engine.state().combat, refs.combat);
  assert.equal(engine.state().combat.turn, refs.turn);
  assert.equal(engine.state().combat.log, refs.log, 'successful combat commit preserves combat.log identity');
  assert.equal(engine.state().combat.turn.spellCasts, refs.spellCasts,
    'successful combat commit preserves turn.spellCasts identity');
  assert.equal(actor.inventory, refs.inventory);
  assert.equal(actor.activeFx, refs.activeFx);
  assert.equal(actor.inventory[0].qty, 1);
  assert.equal(actor.activeFx.filter(effect => effect.k === 'bg3-summon').length, 1);
  assert.equal(turn.actionsUsed, 1);
  assert.equal(turn.actionUsed, true);
  assert.equal(ctx.combatCommitted, true);
  assert.deepEqual(plain(turn.spellCasts), [{id: row.spellId, level: row.spellLevel, cost: 'action'}]);
  const actionLogs = combat.log.filter(entry => entry.kind === 'action'
    && entry.actorKey === `ally:${actor.id}`);
  assert.equal(actionLogs.length, 1);
  assert.match(actionLogs[0].at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  const logTime = Date.parse(actionLogs[0].at);
  assert.equal(Number.isFinite(logTime), true);
  assert.ok(logTime > Date.UTC(2020, 0, 1), 'summon action receipt must not use the Unix epoch');
  assert.ok(logTime <= proofIssuedAtCeiling,
    'the committed combat log must retain the real timestamp sealed before the mutation barrier');
  const committed = plain(engine.worldSnapshot());
  assert.equal(engine.applyArgs(args), false);
  assert.deepEqual(plain(engine.worldSnapshot()), committed);
  assert.equal(engine.bg3ItemSummonAudit().phase, 'replay-rejected');
  assert.equal(randomCalls(), randomBefore,
    `combat rollback/retry/replay rolled\n${randomStacks.slice(randomBefore).join('\n---\n')}`);
});

test('item-linked OnSpellCast composite stays fail-closed before action, item, reaction or overlay mutation', async () => {
  const row = RUNTIME_ROWS.find(source => source.spellId === 'Target_ArcaneEye');
  const oldConcentration = {uid: 'summon-block-old-concentration', k: 'spell',
    id: 'old-concentration', label: 'Old concentration', casterId: 'summon-certificate-user',
    conc: true, stackKey: '', fx: [], mechanicsVersion: 1, effectSchemaVersion: 1};
  const invisibility = {uid: 'summon-block-invisibility', k: 'spell', id: 'sp_invisibility',
    label: 'Невидимость', casterId: 'summon-certificate-user', conc: false, stackKey: '',
    breakOn: ['spell'], mechanicsVersion: 1, effectSchemaVersion: 1,
    fx: [{stat: 'condition', mode: 'text', value: 'Невидимый'}]};
  const fixture = summonBlockInterruptFixture();
  const interruptItem = plain(fixture.item);
  const interruptEntry = {id: 'summon-block-interrupt-entry', itemId: interruptItem.id, qty: 1};
  const observer = hero('summon-block-observer', {inventory: [interruptEntry],
    equipment: {HEAD: interruptEntry.id}});
  const world = await summonWorld({row, qty: 2, activeFx: [oldConcentration, invisibility],
    extraActors: [observer]});
  const {engine, actor, entryId, useId, randomCalls, randomStacks} = world;
  await prepareSummon(world);
  engine.catalogRebind(interruptItem.id, interruptItem);
  const descriptorRow = engine.bg3InterruptDescriptorsOf(interruptItem)[0];
  assert.ok(descriptorRow);
  const seeded = engine.bg3InterruptTestSeedPrepared(interruptItem, descriptorRow.ref,
    descriptorRow.descriptor, plain(fixture.payload));
  assert.equal(seeded.ok, true, seeded.reason);

  const foe = plain(engine.seedFoesDB()[0]);
  engine.state().foesDB.push(foe);
  assert.equal(engine.combatStart([{kind: 'ally', id: actor.id, nat: 20},
    {kind: 'ally', id: observer.id, nat: 10}, {kind: 'foe', id: foe.id, nat: 1}],
  'summon OnSpellCast fail-closed'), true);
  engine.setPromptResults(['summon-block-world,7,8,9']);
  engine.setConfirmResults([true]);
  assert.equal(engine.combatUseItem(entryId, useId), true, summonDiagnostic(world));
  const ctx = engine.castState().ctx;
  const turn = engine.state().combat.turn;
  const observerCombatEntry = engine.state().combat.order.find(value => value.kind === 'ally'
    && value.id === observer.id);
  assert.equal(ctx.target, 'ground');
  assert.equal(turn.actionsUsed, 0);
  assert.equal(observerCombatEntry.reactionUsed, false);
  const beforeCalls = randomCalls();
  const before = plain({actor, observer, combat: engine.state().combat});
  assert.equal(engine.castConfirm(), false, 'unsupported item-linked composite must reject');
  assert.equal(actor.inventory.find(value => value.id === entryId).qty, 2);
  assert.equal(observer.inventory.find(value => value.id === interruptEntry.id).qty, 1);
  assert.equal(turn.actionsUsed, 0);
  assert.equal(turn.actionUsed, false);
  assert.equal(observerCombatEntry.reactionUsed, false);
  assert.equal(ctx.combatCommitted, false);
  assert.equal(actor.activeFx.some(effect => effect.k === 'bg3-summon'), false);
  assert.equal(actor.activeFx.some(effect => effect.uid === oldConcentration.uid), true);
  assert.equal(actor.activeFx.some(effect => effect.uid === invisibility.uid), true);
  assert.deepEqual(plain(turn.spellCasts), []);
  assert.deepEqual(plain({actor, observer, combat: engine.state().combat}), before);
  const issuedAudit = plain(engine.bg3ItemSummonAudit());
  assert.deepEqual(issuedAudit, {phase: 'issued', itemId: row.itemId, useId,
    spellId: row.spellId, profile: 'standard', reason: '', resourceTransactions: 0});

  assert.equal(engine.castConfirm(), false, 'issued composite must remain fail-closed, not terminal-success');
  assert.deepEqual(plain({actor, observer, combat: engine.state().combat}), before);
  assert.deepEqual(plain(engine.bg3ItemSummonAudit()), issuedAudit, 'rejection must not advance audit state');
  assert.equal(randomCalls(), beforeCalls,
    `fail-closed OnSpellCast discovery rolled\n${randomStacks.slice(beforeCalls).join('\n---\n')}`);
});

test('nonempty summon stacks replace only a local same-caster sibling and empty stacks never replace', async () => {
  const row = RUNTIME_ROWS.find(source => source.spellId === 'Target_ConjureIntellectDevour');
  const casterId = 'summon-certificate-user';
  const stackKey = 'bg3-summon:IntellectDevourStack';
  const effect = (uid, owner = casterId, stack = stackKey) => ({uid, k: 'bg3-summon', id: uid,
    label: uid, casterId: owner, conc: false, stackKey: stack, fx: [], mechanicsVersion: 1,
    effectSchemaVersion: 1});
  const same = effect('summon-stack-same');
  const foreign = effect('summon-stack-foreign', 'another-caster');
  const empty = effect('summon-stack-empty', casterId, '');
  const different = effect('summon-stack-different', casterId, 'bg3-summon:OtherStack');
  const remoteSame = effect('summon-stack-remote-same');
  const ally = hero('summon-stack-holder', {activeFx: [remoteSame]});
  const world = await summonWorld({row, activeFx: [same, foreign, empty, different], extraActors: [ally]});
  const opened = await openSummon(world, {position: 'stack-world,1,2,3', canStand: true});
  assert.equal(opened.opened, true, summonDiagnostic(world));
  assert.equal(world.engine.castConfirm(), true, summonDiagnostic(world));
  const uids = new Set(world.actor.activeFx.map(effectRow => effectRow.uid));
  assert.equal(uids.has(same.uid), false);
  for (const survivor of [foreign, empty, different]) assert.equal(uids.has(survivor.uid), true, survivor.uid);
  assert.equal(ally.activeFx[0], remoteSame, 'same caster/stack on another holder is not a local sibling');
  assert.equal(world.actor.activeFx.filter(effectRow => effectRow.k === 'bg3-summon'
    && effectRow.id === row.spellId).length, 1);
  assert.equal(world.actor.inventory[0].qty, 2, 'non-consuming exact carrier remains in inventory');
  assert.equal(world.randomCalls(), 0);

  const emptySibling = effect('summon-empty-light-sibling', casterId, '');
  const light = await summonWorld({activeFx: [emptySibling]});
  const liveEmptySibling = light.actor.activeFx[0];
  const lightOpen = await openSummon(light, {position: 'empty-stack-world,1,2,3'});
  assert.equal(lightOpen.opened, true, summonDiagnostic(light));
  assert.equal(light.engine.castConfirm(), true, summonDiagnostic(light));
  assert.equal(light.actor.activeFx.includes(liveEmptySibling), true);
  assert.equal(light.actor.activeFx.filter(effectRow => effectRow.k === 'bg3-summon').length, 2);
  assert.equal(light.randomCalls(), 0);
});

test('concentration summon replaces same-caster concentration world-wide and leaves foreign/nonconcentration effects', async () => {
  const row = RUNTIME_ROWS.find(source => source.spellId === 'Target_ArcaneEye');
  const casterId = 'summon-certificate-user';
  const concentration = (uid, owner = casterId, conc = true) => ({uid, k: 'spell', id: uid,
    label: uid, casterId: owner, conc, stackKey: '', fx: [], mechanicsVersion: 1,
    effectSchemaVersion: 1});
  const casterOld = concentration('summon-concentration-caster');
  const foreign = concentration('summon-concentration-foreign', 'another-caster');
  const nonconc = concentration('summon-nonconcentration-caster', casterId, false);
  const allyOld = concentration('summon-concentration-ally');
  const ally = hero('summon-concentration-holder', {activeFx: [allyOld]});
  const seedEngine = loadEngine();
  const foe = plain(seedEngine.seedFoesDB()[0]);
  foe.id = 'summon-concentration-foe-holder';
  const foeOld = concentration('summon-concentration-foe');
  foe.activeFx = [foeOld];
  const world = await summonWorld({row, activeFx: [casterOld, foreign, nonconc],
    extraActors: [ally], foes: [foe]});
  const opened = await openSummon(world, {position: 'concentration-world,4,5,6', canStand: true});
  assert.equal(opened.opened, true, summonDiagnostic(world));
  assert.equal(world.engine.castConfirm(), true, summonDiagnostic(world));
  assert.equal(world.actor.activeFx.some(effect => effect.uid === casterOld.uid), false);
  assert.equal(ally.activeFx.some(effect => effect.uid === allyOld.uid), false);
  assert.equal(foe.activeFx.some(effect => effect.uid === foeOld.uid), false);
  assert.equal(world.actor.activeFx.some(effect => effect.uid === foreign.uid), true);
  assert.equal(world.actor.activeFx.some(effect => effect.uid === nonconc.uid), true);
  assert.equal(world.actor.activeFx.filter(effect => effect.k === 'bg3-summon' && effect.conc === true).length, 1);
  assert.equal(world.actor.inventory[0].qty, 1);
  assert.equal(world.randomCalls(), 0, world.randomStacks.join('\n---\n'));
});

test('Sleet Storm replaces its exact stack but keeps adjacent ground RemoveStatus(BURNING) a no-op', async () => {
  const row = RUNTIME_ROWS.find(source => source.spellId === 'Target_SleetStorm');
  const burning = {uid: 'summon-sleet-burning', k: 'use', id: 'burning-sentinel',
    label: 'Burning sentinel', bg3Status: 'BURNING', casterId: 'another-caster', conc: false,
    stackKey: '', breakOn: [], fx: [{stat: 'bg3.status', mode: 'text', value: 'BURNING'}],
    mechanicsVersion: 1, effectSchemaVersion: 1};
  const oldStack = {uid: 'summon-sleet-old-stack', k: 'bg3-summon', id: 'old-sleet',
    label: 'old sleet', casterId: 'summon-certificate-user', conc: false,
    stackKey: 'bg3-summon:SleetStorm', fx: [], mechanicsVersion: 1, effectSchemaVersion: 1};
  const foreignStack = {...oldStack, uid: 'summon-sleet-foreign-stack', casterId: 'another-caster'};
  const world = await summonWorld({row, activeFx: [burning, oldStack, foreignStack]});
  const liveBurning = world.actor.activeFx[0];
  const opened = await openSummon(world, {position: 'sleet-world,7,8,9'});
  assert.equal(opened.opened, true, summonDiagnostic(world));
  assert.equal(world.engine.castConfirm(), true, summonDiagnostic(world));
  assert.equal(world.actor.activeFx.includes(liveBurning), true,
    'ground TARGET removal must not be retargeted to the caster');
  assert.equal(world.actor.activeFx.some(effect => effect.uid === oldStack.uid), false);
  assert.equal(world.actor.activeFx.some(effect => effect.uid === foreignStack.uid), true);
  const overlay = world.actor.activeFx.find(effect => effect.k === 'bg3-summon' && effect.id === row.spellId);
  assert.ok(overlay);
  assert.equal(overlay.stackKey, 'bg3-summon:SleetStorm');
  assert.equal(world.actor.inventory[0].qty, 1);
  assert.equal(world.randomCalls(), 0);
});

test('manual summon provenance survives export/import and remains explicitly dismissible', async () => {
  const row = RUNTIME_ROWS.find(source => source.spellId === 'Target_CursedTome_Seelie_Summon');
  const world = await summonWorld({row});
  const opened = await openSummon(world, {position: 'persist-world,11,12,13', canStand: true});
  assert.equal(opened.opened, true, summonDiagnostic(world));
  assert.equal(world.engine.charFxAll(world.actor).some(effect => effect.sourceUid
    && String(effect.sourceUid).startsWith('bg3-summon-fx-')), false,
  'ordinary derived effects are cached before the atomic overlay commit');
  const committedResult = world.engine.castConfirm();
  assert.equal(committedResult, true, summonDiagnostic(world));
  const source = world.actor.activeFx.find(effect => effect.k === 'bg3-summon');
  assert.ok(source);
  assert.equal(world.engine.charFxAll(world.actor).some(effect => effect.sourceUid === source.uid), true,
    'the private effect epoch invalidates the previously cached derived view');
  assert.equal(source.durationKind, 'manual');
  assert.equal(source.manualDismiss, true);
  assert.equal(Object.prototype.hasOwnProperty.call(source, 'expiresAtRound'), false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(committedResult, true, 'deferred presentation cannot flip the committed return value');
  assert.equal(world.engine.bg3ItemSummonAudit().phase, 'used');
  assert.equal(world.engine.elementText('saveStatus'), '⚗ BG3-призыв размещён в точной позиции мира.');
  await world.engine.runScheduledSave();
  const persisted = JSON.parse(world.engine.storedValue('dndworld2:chars'));
  const persistedActor = persisted.find(value => value.id === world.actor.id);
  assert.ok(persistedActor?.activeFx.some(effect => effect.uid === source.uid),
    'the deferred receipt reaches ordinary local persistence');
  const exported = plain(world.engine.dndWorldExportPayload());
  const restored = loadEngine(() => 0, selectedBg3FileFetch());
  const imported = await restored.dndWorldImportPayload(exported);
  assert.equal(imported.ok, true, imported.reason);
  const restoredActor = restored.state().chars.find(value => value.id === world.actor.id);
  const overlay = restoredActor?.activeFx.find(effect => effect.uid === source.uid);
  assert.ok(overlay);
  assert.deepEqual(plain(overlay.bg3Summon), plain(source.bg3Summon));
  assert.equal(overlay.durationKind, 'manual');
  assert.equal(overlay.manualDismiss, true);
  assert.equal(Object.prototype.hasOwnProperty.call(overlay, 'expiresAtRound'), false);
  restored.removeActiveFx(restoredActor.id, overlay.uid);
  assert.equal(restoredActor.activeFx.some(effect => effect.uid === overlay.uid), false);
  assert.equal(world.randomCalls(), 0);
});
