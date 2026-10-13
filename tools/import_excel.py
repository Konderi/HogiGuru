#!/usr/bin/env python3
"""
Tuo kuluvan kauden tilanteen Excelistä (HG All stars laskin .xlsx) HogiGurun tietokantaan.

Käyttö:
  python3 tools/import_excel.py "data/HG All stars laskin 2026-2027.xlsx" 2027 > data/import.sql
  npx wrangler d1 execute hogiguru --local  --file data/import.sql
  npx wrangler d1 execute hogiguru --remote --file data/import.sql

Logiikka (sama kuin Excelissä):
  - Solu, jossa on kaava  -> aktiivinen paikka. Kaavan perässä oleva vakio (esim. "-9.2")
    = pisteet vaihtohetkellä -> start_points.
  - Solu ilman kaavaa (pelkkä luku) -> vaihdettu pois, arvo jäädytetty -> end_points.
"""
import html, json, re, sys, unicodedata, urllib.request, zipfile

XLSX, SEASON = sys.argv[1], int(sys.argv[2])
DRAFT_DATE = f"{SEASON - 1}-09-01"
SWAP_DATE = f"{SEASON - 1}-10-01"   # tarkka vaihtopäivä ei näy Excelistä

# Rivit: (positio, nimirivi, pisterivi)
LAYOUT = [("C", 5, 7), ("C", 9, 11), ("G", 14, 15), ("G", 16, 17)] + \
         [("D", r, r + 1) for r in (20, 23, 25, 27)] + [("F", r, r + 1) for r in (32, 34, 36, 38, 40, 42)]
POTKUT_ROWS = (8, 12)
TEAM_ROW = {5: 6, 9: 10}


def api(url):
    req = urllib.request.Request(url, headers={"User-Agent": "HogiGuru-import"})
    return json.load(urllib.request.urlopen(req, timeout=60))


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z ]", "", s).strip()


def q(s):
    return "NULL" if s is None else "'" + str(s).replace("'", "''") + "'"


def col_idx(c):
    n = 0
    for ch in c:
        n = n * 26 + ord(ch) - 64
    return n


# --- Lue taulukko XML:stä (Strict OOXML ei aukea openpyxl:llä)
z = zipfile.ZipFile(XLSX)
ss = [html.unescape(re.sub(r"<[^>]+>", "", m)) for m in re.findall(r"<si>(.*?)</si>", z.read("xl/sharedStrings.xml").decode(), re.S)]
wb = z.read("xl/workbook.xml").decode()
rels = z.read("xl/_rels/workbook.xml.rels").decode()
rid = re.search(r'<sheet name="All-star kentät"[^>]*r:id="(rId\d+)"', wb).group(1)
target = re.search(rf'Id="{rid}"[^>]*Target="([^"]+)"', rels) or re.search(rf'Target="([^"]+)"[^>]*Id="{rid}"', rels)
sheet = z.read("xl/" + target.group(1).lstrip("/").replace("xl/", "")).decode()

cells, shared = {}, {}
for ref, attrs, body in re.findall(r'<c r="([A-Z]+\d+)"([^>]*?)(?:/>|>(.*?)</c>)', sheet, re.S):
    col = re.match(r"[A-Z]+", ref).group()
    row = int(ref[len(col):])
    v = re.search(r"<v>(.*?)</v>", body or "")
    val = v.group(1) if v else None
    if val is not None and 't="s"' in attrs:
        val = ss[int(val)]
    fm = re.search(r"<f([^>]*)(?:/>|>(.*?)</f>)", body or "", re.S)
    formula = None
    if fm:
        fattrs, ftext = fm.group(1), html.unescape(fm.group(2) or "")
        si = re.search(r'si="(\d+)"', fattrs)
        if ftext:
            formula = ftext
            if si:
                shared[si.group(1)] = ftext
        elif si:
            formula = shared.get(si.group(1), "SHARED")
    cells[(col, row)] = (val, formula)

# --- Liigan data nimien yhdistämiseen
skaters = api(f"https://liiga.fi/api/v2/players/stats/summed/{SEASON}/{SEASON}/runkosarja/true?dataType=basicStats")
goalies = api(f"https://liiga.fi/api/v2/players/stats/summed/{SEASON}/{SEASON}/runkosarja/true?dataType=basicStatsGk")
teams = api(f"https://liiga.fi/api/v2/standings/?season={SEASON}")["season"]
by_name = {}
for p in skaters + goalies:
    by_name.setdefault(norm(f"{p['firstName']} {p['lastName']}"), p)
team_by_name = {norm(t["teamName"]): str(t["teamId"]) for t in teams}
TEAM_ALIASES = {"kiekkoespoo": "kespoo", "espoo": "kespoo", "saipa": "saipa", "assat": "assat"}
placeholders = {}


def find_team(raw):
    n = norm(raw).replace(" ", "")
    n = TEAM_ALIASES.get(n, n)
    for k, v in team_by_name.items():
        if k.replace(" ", "") == n:
            return v
    return None


def placeholder(name, pos):
    """Pelaaja, jota ei löydy kauden tilastoista (ei pelannut / lähtenyt). HG = 0 kuten Excelin IFERROR."""
    key = norm(name)
    if key not in placeholders:
        pid = 9_000_000 + len(placeholders) + 1
        placeholders[key] = pid
        clean = re.sub(r"^[A-Z][a-z]+ flag", "", name)
        first, _, last = clean.partition(" ")
        out.append(f"INSERT OR IGNORE INTO players (id, first_name, last_name, team_name, role) VALUES ({pid}, {q(first)}, {q(last or first)}, NULL, {q({'G': 'MV', 'D': 'P', 'F': 'H'}[pos])});")
    return placeholders[key]


def find_player(raw, goalie):
    n = norm(raw)
    if n in by_name:
        return by_name[n]
    # Maalivahtien nimissä on roskaa ("Finland flagAntti Raanta...logo")
    hits = [(k, p) for k, p in by_name.items() if k and k in n and (p["goalkeeper"] or not goalie)]
    if hits:
        return max(hits, key=lambda kp: len(kp[0]))[1]
    # Eri kirjoitusasu etunimessä (Matt/Matthew, Trenton/Trent, Oliver-Joakim/Oliver): sukunimi + etunimen alku
    clean = norm(re.sub(r"^[A-Z][a-z]+ flag", "", raw)).split()
    if len(clean) >= 2:
        first, last = clean[0], clean[-1]
        cands = [p for p in skaters + goalies if norm(p["lastName"]) == last and (p["goalkeeper"] or not goalie)
                 and (norm(p["firstName"])[:3] == first[:3])]
        if len({c["playerId"] for c in cands}) == 1:
            return cands[0]
    return None


def offset(formula):
    m = re.search(r",0\)\s*([+-]\s*[\d.]+)\s*$", formula or "")
    return -float(m.group(1).replace(" ", "")) if m else 0.0


out = ["-- HogiGuru: Excel-tuonti", f"-- Lähde: {XLSX}", "PRAGMA foreign_keys = ON;",
       f"UPDATE seasons SET roster = '{{\"C\":1,\"G\":1,\"D\":2,\"F\":3}}' WHERE liiga_season = {SEASON};",
       f"DELETE FROM gurus WHERE season_id = (SELECT id FROM seasons WHERE liiga_season = {SEASON});",
       f"DELETE FROM coaches WHERE season_id = (SELECT id FROM seasons WHERE liiga_season = {SEASON});"]
for t in teams:
    out.append(f"INSERT OR IGNORE INTO teams (id, name, short_name, logo) VALUES ({q(str(t['teamId']))}, {q(t['teamName'])}, {q(t.get('teamShortName'))}, {q((t.get('teamLogos') or {}).get('darkBg'))});")
for p in skaters + goalies:
    out.append(f"INSERT OR IGNORE INTO players (id, first_name, last_name, team_id, team_name, role, picture) VALUES ({p['playerId']}, {q(p['firstName'])}, {q(p['lastName'])}, {q(str(p['teamId']))}, {q(p['teamName'])}, {q(p['role'])}, {q(p.get('pictureUrl'))});")

SEASON_ID = f"(SELECT id FROM seasons WHERE liiga_season = {SEASON})"
coaches, warnings, expected = {}, [], {}
cols = sorted({c for (c, r) in cells if r == 3 and cells[(c, r)][0] and c != "A"}, key=col_idx)

for col in cols:
    guru = cells[(col, 3)][0].strip()
    total = cells.get((col, 44), (None, None))[0]
    expected[guru] = float(total) if total else 0.0
    out.append(f"INSERT INTO gurus (season_id, name) VALUES ({SEASON_ID}, {q(guru)});")
    G = f"(SELECT id FROM gurus WHERE season_id = {SEASON_ID} AND name = {q(guru)})"
    seen_pos = {}
    for pos, nrow, prow in LAYOUT:
        name, _ = cells.get((col, nrow), (None, None))
        pts, formula = cells.get((col, prow), (None, None))
        if not name or not str(name).strip() or str(name).startswith(("Valmentaja:", "Puolustajat:", "Hyökkääjät:")):
            continue
        name = str(name).strip()
        idx = seen_pos.get(pos, 0); seen_pos[pos] = idx + 1
        start_date = DRAFT_DATE if idx < {"C": 1, "G": 1, "D": 2, "F": 3}[pos] else SWAP_DATE
        if pos == "C":
            team_raw = cells.get((col, TEAM_ROW[nrow]), (None, None))[0] or ""
            tid = find_team(team_raw)
            if not tid:
                warnings.append(f"{guru}: joukkuetta '{team_raw}' ei tunnistettu ({name})"); continue
            key = (norm(name), tid)
            if key not in coaches:
                coaches[key] = name
                out.append(f"INSERT INTO coaches (season_id, name, team_id) VALUES ({SEASON_ID}, {q(name)}, {q(tid)});")
            ent = f"(SELECT id FROM coaches WHERE season_id = {SEASON_ID} AND name = {q(name)} AND team_id = {q(tid)})"
        else:
            p = find_player(name, pos == "G")
            if p:
                ent = str(p["playerId"])
            else:
                warnings.append(f"{guru}: '{name}' ei liiga.fi:n kauden tilastoissa -> 0 p (kuten Excelissä)")
                ent = str(placeholder(name, pos))
        if formula:
            replaced = "NULL"
            if start_date == SWAP_DATE:
                replaced = (f"(SELECT o.id FROM roster_slots o WHERE o.guru_id = {G} AND o.position = '{pos}' AND o.end_date IS NOT NULL "
                            f"AND o.id NOT IN (SELECT replaced_slot_id FROM roster_slots WHERE replaced_slot_id IS NOT NULL) ORDER BY o.id LIMIT 1)")
            out.append(f"INSERT INTO roster_slots (guru_id, position, entity_id, start_date, start_points, replaced_slot_id) VALUES ({G}, '{pos}', {ent}, '{start_date}', {offset(formula)}, {replaced});")
        else:
            frozen = float(pts or 0)
            out.append(f"INSERT INTO roster_slots (guru_id, position, entity_id, start_date, end_date, start_points, end_points) VALUES ({G}, '{pos}', {ent}, '{start_date}', '{SWAP_DATE}', 0, {frozen});")
    for r in POTKUT_ROWS:
        v = cells.get((col, r), (None, None))[0]
        if v not in (None, "") and float(v) != 0:
            out.append(f"INSERT INTO adjustments (guru_id, points, reason) VALUES ({G}, {float(v)}, 'Valmentajan potkut (Excel-tuonti)');")

out.append(f"UPDATE seasons SET draft_status = 'done' WHERE id = {SEASON_ID};")
out.append(f"UPDATE swap_days SET processed_at = CURRENT_TIMESTAMP WHERE season_id = {SEASON_ID} AND date <= '{SWAP_DATE}' AND processed_at IS NULL;")
print("\n".join(out))
print(f"-- Gurut: {len(cols)}, valmentajat: {len(coaches)}", file=sys.stderr)
for w in warnings:
    print("VAROITUS:", w, file=sys.stderr)
json.dump(expected, open("data/import_expected.json", "w"), ensure_ascii=False, indent=1)
