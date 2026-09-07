"""Extract spell headers and class lists from the publisher's CC SRD 5.1 PDF.
Usage: python scripts/extract-srd51-spells.py path/to/SRD_CC_v5.1.pdf
No API's inferred class/school metadata is used.
"""
import hashlib, json, pathlib, re, sys
from pypdf import PdfReader

pdf = pathlib.Path(sys.argv[1])
digest = hashlib.sha256(pdf.read_bytes()).hexdigest()
if digest != '2504d2a0abb0a4d491a939be4f17910a2dde0312570ab8d208080225ccf0a1f0':
    raise ValueError('The input is not the pinned official CC SRD 5.1 PDF; verify the source before updating the manifest.')
raw_pages=[page.extract_text() for page in PdfReader(pdf).pages]
pages = [re.sub(r'\s+', ' ', page).replace('\u2019', "'") for page in raw_pages]
clean = lambda value: re.sub(r'[-\u00ad\u2010\u2011]+', '-', value).strip()
pages = [clean(page) for page in pages]
start = next(i for i, page in enumerate(pages) if 'Spell Descriptions' in page)
end = next(i for i, page in enumerate(pages[start+1:], start+1) if re.match(r'System Reference Document 5\.1 \d+ Traps ',page))
text = ' '.join(re.sub(r'System Reference Document 5\.1 \d+ ', '', page) for page in pages[start:end])
school = r'(?i:abjuration|conjuration|divination|enchantment|evocation|illusion|necromancy|transmutation)'
header = re.compile(r"(?P<name>[A-Z][A-Za-z' /-]+?) (?P<tier>(?:[1-9](?:st|nd|rd|th)-level " + school + r'|' + school + r' cantrip))(?: \((?P<ritual>ritual)\))? Casting Time: (?P<time>.+?) Range: (?P<range>.+?) Components?: (?P<components>.+?) Duration: (?P<duration>(?:Concentration,? )?(?:up to |Up to )?(?:(?:[0-9]+|one) (?:rounds?|minutes?|hours?|days?)|Instantaneous|Special|Until dispelled(?: or triggered)?))')
matches = list(header.finditer(text))
records = []
for i, match in enumerate(matches):
    name = match['name'].strip()
    # The spell title starts after the preceding sentence/list. Capitalization alone is insufficient;
    # pin the exact 319 names from our CC source manifest and reject ambiguous extraction.
    records.append((name, match, text[match.end():matches[i+1].start() if i+1<len(matches) else len(text)]))
# The editorial dictionary is explicit and complete; extraction checks every name once.
rules = pathlib.Path('scripts/grimoire-rules.js').read_text(encoding='utf-8')
names = [line.split('|')[0] for line in rules.split('Object.fromEntries(`',1)[1].split('`.split',1)[0].splitlines()]
facts = {}
for raw_name, match, body in records:
    candidates = [name for name in names if raw_name == name or raw_name.endswith(' '+name)]
    if not candidates: continue
    name = max(candidates, key=len)
    if name in facts: raise ValueError('duplicate header: '+name)
    tier = match['tier']
    page = next((i+1 for i,p in enumerate(pages) if i>=start and re.search(re.escape(name)+r' '+re.escape(tier),p)), None)
    facts[name] = dict(level=0 if 'cantrip' in tier else int(tier[0]),school=(tier.split()[0] if 'cantrip' in tier else tier.split()[-1]).lower(),castingTime=match['time'],range=match['range'],components=match['components'],duration=match['duration'],ritual=bool(match['ritual']),concentration=match['duration'].startswith('Concentration'),upcast='At Higher Levels.' in body,classes=[],page=page)
missing = sorted(set(names)-facts.keys())
if missing:
    for name in missing:
        for raw,match,body in records:
            if name in match.group(0): print(json.dumps(dict(missing=name,matched=match.group(0)),ensure_ascii=True))
    raise ValueError('missing headers: '+repr(missing))
lists = ' '.join(re.sub(r'System Reference Document 5\.1 \d+ ', '',page) for page in pages[104:start])
class_headers = list(re.finditer(r'(Bard|Cleric|Druid|Paladin|Ranger|Sorcerer|Warlock|Wizard) Spells', lists))
for i, match in enumerate(class_headers):
    section = lists[match.end():class_headers[i+1].start() if i+1<len(class_headers) else len(lists)]
    section = re.sub(r'Cantrips \(0 Level\)|[1-9](?:st|nd|rd|th) Level|Spell Lists', '',section).strip()
    while section:
        candidates = [name for name in names if section==name or section.startswith(name+' ')]
        if not candidates: raise ValueError('unmatched class list '+match[1]+': '+section[:100])
        name = max(candidates,key=len);facts[name]['classes'].append(match[1]);section=section[len(name):].strip()
assert len(class_headers)==8 and len({match[1] for match in class_headers})==8
assert len(facts)==319 and all(row['classes'] for row in facts.values())
assert all(row['page'] and len(row['castingTime'])<150 and len(row['range'])<80 and len(row['components'])<600 for row in facts.values())
output = pathlib.Path('data/dnd5e/srd51-spell-facts.js')
payload = dict(schemaVersion='srd51-spell-facts/1',source='https://media.dndbeyond.com/compendium-images/srd/5.1/SRD_CC_v5.1.pdf',sha256=digest,license='CC-BY-4.0',spells=facts)
output.write_text('globalThis.DND_SRD51_SPELL_FACTS='+json.dumps(payload,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
print(json.dumps(dict(spells=len(facts),classLists=len(class_headers),sha256=payload['sha256'])))
