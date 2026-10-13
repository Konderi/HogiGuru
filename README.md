# HogiGuru

Liigan All-Stars-veikkaus. Leaderboardit, draft, vaihdot, Hall of Fame ja ylläpito.
Osoite: **https://guru.konderi.fi**

## Arkkitehtuuri

| Osa | Tekniikka |
|---|---|
| Frontend | React + Vite + Tailwind (src/) |
| API + ajastus | Cloudflare Worker + Hono (worker/) |
| Tietokanta | Cloudflare D1 (migrations/) |
| Tilastot | liiga.fi:n JSON-rajapinta, haku tunnin välein (cron) |

Tietolähteet (korvaavat Excelin quanthockey/eliteprospects/jatkoaika-kopioinnit):
- `https://liiga.fi/api/v2/players/stats/summed/{kausi}/{kausi}/runkosarja/true?dataType=basicStats` – kenttäpelaajat
- `…?dataType=basicStatsGk` – maalivahdit
- `https://liiga.fi/api/v2/standings/?season={kausi}` – sarjataulukko

## Pisteytys (Excelistä, muokattavissa ylläpidossa)

| Rooli | Kaava |
|---|---|
| Hyökkääjä | 1.5·M + 0.9·S + 0.1·J + 0.4·(+/−) − 0.5·O |
| Puolustaja | 2.5·M + 1.5·S + 0.1·J + 0.4·(+/−) − 0.5·O |
| Maalivahti | 2·nollapeli + 0.1·torjunta − 1·päästetty |
| Valmentaja | 0.5·joukkueen sarjapisteet, potkut −10 |

Paikan pisteet = (loppupisteet TAI nykyiset) − alkupisteet. Vaihdossa alkupisteet = pelaajan pisteet vaihtohetkellä.

## Kehitys

```bash
npm install
npm run db:migrate:local
npm run dev                 # http://localhost:5173
```
Ensimmäisellä käynnistyksellä /kirjaudu pyytää luomaan pääkäyttäjän.

## Julkaisu Cloudflareen

```bash
export CLOUDFLARE_API_TOKEN=...       # ks. alla
export CLOUDFLARE_ACCOUNT_ID=...
npx wrangler d1 create hogiguru       # kopioi database_id -> wrangler.jsonc
npm run db:migrate:remote
npm run deploy
```
API-tokenin oikeudet (My Profile → API Tokens → Create Custom Token):
- Account · Workers Scripts · Edit
- Account · D1 · Edit
- Account · Account Settings · Read
- Zone (konderi.fi) · Workers Routes · Edit
- Zone (konderi.fi) · DNS · Edit

## Kuluvan kauden tuonti Excelistä

```bash
python3 tools/import_excel.py "data/HG All stars laskin 2026-2027.xlsx" 2027 > data/import.sql
npx wrangler d1 execute hogiguru --remote --file data/import.sql
```
Tuo 53 gurua, kentälliset, vaihdot (alku-/loppupisteet kaavoista) ja valmentajien potkut.
Tarkistettu: 52/53 gurua täsmää Exceliin 0.1 p tarkkuudella (ero johtuu quanthockeyn vanhentuneesta datasta).

## Tiekartta
- [x] Vaihe 1: Leaderboard, sarjataulukko, tilastot + varaustilanne, vaihtopäivät, ylläpito, draft, Excel-tuonti
- [ ] Vaihe 2: Veikattu sarjataulukko (säännöt auki), gurujen kehityskäyrät
- [ ] Vaihe 3: Hall of Fame -historian tuonti vanhoista Exceleistä
- [ ] AI: viikkokatsaukset (Workers AI)
- [ ] Avoin: vaihtojen määrä kaudessa ja vaihtopäivät
