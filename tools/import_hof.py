#!/usr/bin/env python3
"""Hall of Fame -tuonti maratontaulukosta (.xls).

Käyttö:
  python3 -m venv /tmp/xv && /tmp/xv/bin/pip install xlrd
  /tmp/xv/bin/python tools/import_hof.py data/maratontaulukko.xls > data/hof.sql
  npx wrangler d1 execute hogiguru --remote --file data/hof.sql

Tuo jokaisen kauden jokaisen gurun sijoituksen tauluun hall_of_fame.
points = kauden maratonpisteet = (osallistujat + 1 − sija) / osallistujat × 100
note   = gaalapaikka (vain voittajan rivillä)
Lopuksi tarkistetaan, että pisteiden summat täsmäävät Excelin Maratonpisteet-sarakkeeseen.
"""
import re
import sys

import xlrd


def q(s):
    return "NULL" if s is None else "'" + str(s).replace("'", "''") + "'"


sh = xlrd.open_workbook(sys.argv[1]).sheet_by_name('Maraton')
venues, header = sh.row_values(0), sh.row_values(1)

season_cols = []
for c, h in enumerate(header):
    m = re.match(r'Sij\.?\s*(\d\d)-(\d\d)', str(h))
    if m:
        season_cols.append((c, f"20{m.group(1)}–20{m.group(2)}"))
total_col = next(c for c, h in enumerate(header) if str(h).startswith('Maratonpisteet'))

people = []
for r in range(2, sh.nrows):
    row = sh.row_values(r)
    if str(row[0]).strip():
        people.append(row)

out = ["DELETE FROM hall_of_fame;"]
totals = {}
for c, season in season_cols:
    entries = [(int(p[c]), p[0].strip()) for p in people if isinstance(p[c], float)]
    n = len(entries)
    for rank, name in sorted(entries):
        pts = (n + 1 - rank) / n * 100
        totals[name] = totals.get(name, 0) + pts
        note = venues[c].strip() if rank == 1 and str(venues[c]).strip() else None
        out.append(f"INSERT INTO hall_of_fame (season_name, rank, name, points, note) VALUES ({q(season)}, {rank}, {q(name)}, {round(pts, 4)}, {q(note)});")

bad = [(p[0], totals.get(p[0].strip(), 0), p[total_col]) for p in people
       if isinstance(p[total_col], float) and abs(totals.get(p[0].strip(), 0) - p[total_col]) > 0.01]
print("\n".join(out))
print(f"-- {len(season_cols)} kautta, {len(people)} gurua, {len(out) - 1} sijoitusta", file=sys.stderr)
for b in bad:
    print(f"VAROITUS: maratonpisteet eivät täsmää: {b}", file=sys.stderr)
