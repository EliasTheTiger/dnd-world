# BG3 item placement projection

Catalog: `bg3-24532579-v8`  
Source definitions: **59,023**  
Stable MapKey instances: **59,020**  
Standard/Honour effective placements: **59,019 / 59,020**  
Projected item variants (Standard/Honour/union): **10,282 / 10,284 / 10,284**  
Direct `level-instance.stats` pairs: **608**; occurrences: **1,290**  
Unresolved roots / direct pairs / ambiguous variants: **0 / 0 / 0**  
Profile collisions resolved by module order: **3**  
Placement record/index shards: **1,051 / 512**; maxima: **210,000 / 210,000 bytes**.
Placement-local action/script sets: **6,124**; action programs: **2,641**; typed/manual: **398 / 2,243**.  
Direct Scripts / ScriptOverrides declarations: **3,771 / 340**.

A missing GameObjects `Stats` attribute remains null. Variant resolution uses exact instance Stats first, then an explicit RootTemplate Stats edge, then a unique root identity; ambiguity fails closed.
Placement-local Teleport (ActionDataType 3) compiles only from complete direct source fields. Unknown35 and all other unsupported local actions remain explicit manual opcodes. StoryUse never auto-binds a TrapProjectile script parameter.
