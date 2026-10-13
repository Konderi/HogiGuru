# 🏒 HogiGuru

**HogiGuru – Liiga-veikkaus verkossa.** HogiGuru on kaveriporukan jääkiekkokisa, jossa kisaajat eli *gurut* veikkaavat kauden alussa runkosarjan lopputuloksen, joukkueiden parhaat pistemiehet ja pörssien voittajat. Lisäksi jokainen kokoaa draftissa oman All-Stars-kentällisensä Liigan pelaajista ja valmentajista. Kentällinen kerää pisteitä koko runkosarjan ajan pelaajien oikeiden tilastojen perusteella, ja sitä voi muuttaa sovittuina vaihtopäivinä.

Sivusto korvaa aiemman Excel-laskimen ja paperisen osallistumiskaavakkeen: tilastot päivittyvät automaattisesti suoraan liiga.fi:stä, ilmoittautuminen ja veikkaukset tehdään verkossa, gurut näkevät oman joukkueensa kirjautumalla, ja ylläpito hoitaa draftin, vaihdot ja pisteytyksen selaimessa.

🌐 **Tuotanto:** https://guru.konderi.fi
📦 **Repo:** https://github.com/Konderi/HogiGuru

---

## Sisällys

1. [Pelin säännöt](#pelin-säännöt)
2. [Ominaisuudet](#ominaisuudet)
3. [Arkkitehtuuri](#arkkitehtuuri)
4. [Hakemistorakenne](#hakemistorakenne)
5. [Tietomalli](#tietomalli)
6. [Pisteytys](#pisteytys)
7. [Tilastojen haku liiga.fi:stä](#tilastojen-haku-liigafista)
8. [Ilmoittautuminen](#ilmoittautuminen)
9. [Draft](#draft)
10. [Vaihdot](#vaihdot)
11. [Käyttäjät ja oikeudet](#käyttäjät-ja-oikeudet)
12. [API-rajapinta](#api-rajapinta)
13. [Kehitysympäristö](#kehitysympäristö)
14. [Julkaisu Cloudflareen](#julkaisu-cloudflareen)
15. [Excel-tuonti](#excel-tuonti)
16. [Ylläpitäjän ohje](#ylläpitäjän-ohje)
17. [Tietoturva](#tietoturva)
18. [Tiekartta](#tiekartta)

---

## Pelin säännöt

Kauden 2026–2027 säännöt (osallistumiskaavakkeesta):

| Sääntö | Arvo | Muokattavissa |
|---|---|---|
| Kentällinen | 1 valmentaja, 1 maalivahti, 2 puolustajaa, 3 hyökkääjää | ✅ |
| Sama valinta enintään | valmentaja 5, maalivahti 5, puolustaja 5, hyökkääjä 4 gurua | ✅ |
| Vaihtoja kaudessa | 4 | ✅ |
| Vaihtopäivät | su 11.10., 29.11., 10.1., 21.2. klo 9–21 | ✅ |
| Valmentajan potkut | −10 p jokaiselle gurulle, jolla valmentaja on | ✅ |
| Osallistumismaksu | 30 € | ✅ |
| Ilmoittautuminen | viimeistään ti 1.9.2026 klo 18.30 | ✅ |

- Pisteet lasketaan **runkosarjan** tilastoista.
- Vaihdossa poistuvan pelaajan keräämät pisteet **jäävät gurulle**; uusi pelaaja kerää pisteitä vaihtohetkestä eteenpäin.
- Valmentajan saa vaihtaa aina potkujen yhteydessä. Jos ei vaihda, saman joukkueen uusi valmentaja jatkaa pisteiden keräämistä.
- Vaihdot ilmoitetaan WhatsApp-ryhmään vaihtopäivänä; ne astuvat voimaan, kun HG-komitea on kuitannut ne.
- Gurun kentällinen näkyy vain hänelle itselleen ja ylläpidolle. Julkisesti näkyy vain, **kuinka monella** pelaaja on (esim. 3/5).
- HG-komitea päättää mahdollisista sääntömuutoksista. Kaikilla on valitusoikeus.

---

## Ominaisuudet

### Julkinen sivusto
| Sivu | Polku | Sisältö |
|---|---|---|
| Etusivu | `/` | Ilmoittautumisbanneri (kun auki), palkintopalli, Top 10, seuraavan vaihtopäivän lähtölaskenta, viimeisin päivitys, sarjataulukko |
| Ilmoittaudu | `/ilmoittaudu` | Osallistumislomake veikkauksineen ja säännöt |
| Leaderboard | `/leaderboard` | Kaikki gurut, sijoitusmuutokset ▲▼, ero kärkeen |
| Sarjataulukko | `/sarjataulukko` | Liigan runkosarja |
| Tilastot | `/tilastot` | Pelaajat ja valmentajat HG-pisteineen, varaustilanne, "vain vapaat" -suodatin |
| Hall of Fame | `/hall-of-fame` | Aiempien kausien mitalistit |

### Gurun näkymät (kirjautunut)
| Sivu | Polku | Sisältö |
|---|---|---|
| Oma joukkue | `/oma-joukkue` | Kentällinen, pisteerittely, vaihdetut pelaajat, korjaukset, draft-ennakkolista, salasanan vaihto |
| Draft | `/draft` | Live-draft-taulu |

### Ylläpito (`/admin`)
| Osio | Toiminnot |
|---|---|
| Yleiskatsaus | Tilastopäivitys napista, päivitysloki, avainluvut |
| Ilmoittautuminen | Lomakkeen avaus/sulku, määräaika, maksu, lisätieto; ilmoittautuneet, veikkausten tarkastelu, hyväksyntä guruksi (+ tunnus), CSV-vienti |
| Draft | Listat, arvonta, live-valinnat, ennakkolistat, peruminen, vienti kentällisiin |
| Vaihdot | Vaihtopäivät kellonaikoineen, vaihtoloki, peruminen |
| Gurut & kentälliset | Gurut, kentälliset, vaihdot, paikkojen muokkaus, pistekorjaukset |
| Pisteytys & kausi | Kertoimet, kentällisen koko, valintarajat paikoittain, vaihtojen määrä, veikkausosion pisteet |
| Valmentajat | Valmentajat, potkut |
| Käyttäjät | Tunnukset, roolit, salasanat, liitos guruun |
| Hall of Fame | Historiatulokset |

---

## Arkkitehtuuri

```
                    ┌──────────────────────────────────────────────┐
  Selain ──────────▶│  Cloudflare Worker  (guru.konderi.fi)        │
                    │  /*        → staattiset tiedostot (React SPA)│
                    │  /api/*    → Hono-API (worker/index.ts)      │
                    │  cron      → syncLiiga() tunnin välein       │
                    └──────────────┬───────────────────┬───────────┘
                            ┌──────▼──────┐     ┌──────▼─────────┐
                            │ Cloudflare  │     │ liiga.fi       │
                            │ D1 (SQLite) │     │ /api/v2 (JSON) │
                            └─────────────┘     └────────────────┘
```

| Kerros | Teknologia |
|---|---|
| Frontend | React 19, React Router, Vite, Tailwind CSS v4 |
| Backend | Cloudflare Workers + [Hono](https://hono.dev) |
| Tietokanta | Cloudflare D1 (SQLite) |
| Ajastus | Workers Cron Triggers (`5 * * * *`) |
| Kirjautuminen | PBKDF2-salasanat + HttpOnly-istuntoeväste |
| Build | `@cloudflare/vite-plugin` |

Frontend ja API julkaistaan **yhtenä Workerina**; vain `/api/*` ohjataan koodille (`run_worker_first`).

**Ilme:** tumma jäähalliteema, jäänsininen korostus, maalivalon punainen, kaukalon viivat taustalla, tulostaulumainen numerofontti. Responsiivinen.

---

## Hakemistorakenne

```
HogiGuru-app/
├── wrangler.jsonc               Cloudflare-konfiguraatio (D1, cron, domain)
├── vite.config.ts
├── migrations/
│   ├── 0001_init.sql            tietokantarakenne + oletuspisteytys
│   └── 0002_registration.sql    ilmoittautuminen, valintarajat, kauden 26–27 säännöt ja vaihtopäivät
├── worker/                      BACKEND
│   ├── index.ts                 API-reitit, istunnot, cron
│   ├── data.ts                  kausi, leaderboard, varaukset, valintarajat
│   ├── scoring.ts               pisteytyskaavat
│   ├── draft.ts                 draft, automaattivalinta, vaihdot
│   ├── liiga.ts                 liiga.fi-synkronointi
│   └── auth.ts                  salasanat, istunnot
├── src/                         FRONTEND
│   ├── main.tsx, Layout.tsx, api.ts, auth.tsx, ui.tsx, index.css
│   ├── components/DraftPrefs.tsx
│   ├── pages/                   Home, Register, Leaderboard, Standings, Stats, HallOfFame, Login, MyTeam, DraftBoard
│   └── admin/                   AdminLayout, Dashboard, Registrations, Draft, Swaps, Gurus, Scoring, Coaches, Users, HallOfFame
├── tools/import_excel.py        kauden tuonti Excelistä
├── docs/excel-analyysi.md       alkuperäisen Excelin analyysi
└── data/                        EI versionhallinnassa (Excelit, kaavake)
```

---

## Tietomalli

| Taulu | Tarkoitus |
|---|---|
| `users`, `sessions` | Tunnukset (`admin`/`guru`) ja istunnot |
| `seasons` | Kausi: säännöt, kentällinen, pisteytys (JSON), valintarajat paikoittain, draftin tila, ilmoittautumisen asetukset |
| `teams`, `players`, `player_stats`, `standings` | liiga.fi-data |
| `coaches` | Valmentajat + potkut |
| `gurus` | Kisaajat, linkki tunnukseen, draft-numero |
| `roster_slots` | **Kentällisen paikat** aikaväleittäin |
| `adjustments` | Pistekorjaukset |
| `swap_days` | Vaihtopäivät (päivä, alku- ja loppuaika) |
| `registrations` | Ilmoittautumiset: yhteystiedot, veikattu sarjataulukko, parhaat pistemiehet, kategoriat, tila |
| `draft_pool`, `draft_picks`, `draft_prefs` | Draft |
| `leaderboard_history` | Päivittäiset sijat |
| `hall_of_fame` | Aiemmat kaudet |
| `sync_log` | Päivitysloki |

**Kentällisen paikka:** aktiivinen kun `end_date IS NULL`. Pisteet = `(end_points ?? nykyiset) − start_points`. Vaihto jäädyttää vanhan paikan ja avaa uuden, jonka alkupisteet ovat uuden pelaajan pisteet vaihtohetkellä (vastaa Excelin `…)-9.2`-vähennystä).

**Gurun pisteet** = Σ paikkojen pisteet + Σ pistekorjaukset.

---

## Pisteytys

### All-Stars
| Rooli | Maali | Syöttö | Jäähymin. | +/− | Ottelu |
|---|---|---|---|---|---|
| **Hyökkääjä** | 1,5 | 0,9 | 0,1 | 0,4 | −0,5 |
| **Puolustaja** | 2,5 | 1,5 | 0,1 | 0,4 | −0,5 |

| Rooli | Kaava |
|---|---|
| **Maalivahti** | 2 × nollapeli + 0,1 × torjunta − 1 × päästetty maali |
| **Valmentaja** | 0,5 × joukkueen sarjapisteet; potkut −10 |

Esimerkki: hyökkääjä 11 O, 2+6, +5, 2 J → 3 + 5,4 + 0,2 + 2 − 5,5 = **5,1**.

### Veikkausosio
| Kohde | Oikein | 1 päässä / top 3 | 2 päässä / top 5 |
|---|---|---|---|
| Runkosarjan lopputulos (17 joukkuetta) | 6 | 4 | 1 |
| Joukkueen paras pistemies | 7 | 4 | 2 |
| Pörssit (piste, maali, syöttö, +/−, puolustajat, jäähy) | 12 | 6 | 3 |
| Eniten nollapelejä | puolitetut pisteet | | |

Veikkaukset tallennetaan ilmoittautumisen yhteydessä; pisteiden automaattinen laskenta on tiekartalla.

Kaikki kertoimet: Ylläpito → Pisteytys & kausi. Koodi: [`worker/scoring.ts`](worker/scoring.ts).

---

## Tilastojen haku liiga.fi:stä

| Data | Osoite |
|---|---|
| Kenttäpelaajat | `https://liiga.fi/api/v2/players/stats/summed/{kausi}/{kausi}/runkosarja/true?dataType=basicStats` |
| Maalivahdit | `…?dataType=basicStatsGk` |
| Sarjataulukko | `https://liiga.fi/api/v2/standings/?season={kausi}` |

`{kausi}` = päättymisvuosi (2026–2027 → `2027`). Ajetaan tunnin välein ja napista. Rajapinta on epävirallinen; muutokset korjataan tiedostoon `worker/liiga.ts`.

---

## Ilmoittautuminen

1. Ylläpito → **Ilmoittautuminen** → aseta määräaika, maksu ja lisätieto → **▶ Avaa ilmoittautuminen**.
2. Etusivulle ilmestyy banneri ja yläpalkkiin linkki **Ilmoittaudu** (`/ilmoittaudu`).
3. Lomake: nimi, puhelin, sähköposti; sarjataulukko järjestetään nuolilla; joukkueen paras pistemies valitaan joukkueen pelaajista; pörssivoittajat haetaan nimellä. Oikealla näkyvät säännöt, pisteytys ja vaihtopäivät.
4. Saman sähköpostin uusi lähetys päivittää aiemman ilmoittautumisen (veikkauksia voi korjata määräaikaan asti).
5. Lomake sulkeutuu automaattisesti määräajan jälkeen.
6. Ylläpito tarkastelee veikkauksia ja painaa **Hyväksy** → guru luodaan (tai liitetään samannimiseen) ja halutessa samalla tunnus annetulla salasanalla.

Roskapostin torjuntana lomakkeessa on piilokenttä.

---

## Draft

**Tilat:** `setup` → `live` → `done`

1. **Valmistelu:** gurut, draft-listat paikoittain, etäosallistujat, järjestyksen arvonta 🎲
2. **Ennakkolistat:** etäosallistuja antaa paikkajärjestyksen (esim. `H, MV, P, V, H, P, H`) ja toivelistat
3. **Live:** vuorossa oleva guru valitsee minkä tahansa paikan pelaajan; ⚙ valinta ennakkolistalta; ↶ peru
4. **Valmis:** ✓ vie kentällisiin

Tarkistukset: pelaaja listalla, paikka ei täynnä, ei tuplavalintaa, paikkakohtainen enimmäismäärä (H 4, muut 5). Käärmedraft valinnainen.

---

## Vaihdot

1. Vaihtopäivät ovat valmiina (Ylläpito → Vaihdot); etusivulla lähtölaskenta seuraavan vaihtoikkunan alkuun.
2. Gurut etsivät vapaita pelaajia Tilastot-sivulta.
3. Ylläpito → **Gurut** → ⇄ Vaihda. Järjestelmä tarkistaa valintarajat ja 4 vaihdon maksimin.

**Potkut:** Valmentajat → Potkut (−10 p), sitten tarvittaessa vaihto.

---

## Käyttäjät ja oikeudet

| Rooli | Näkee | Voi tehdä |
|---|---|---|
| Vierailija | Julkiset sivut | Ilmoittautua |
| Guru | + oma kentällinen, draft | Ennakkolista, salasanan vaihto |
| Ylläpitäjä | Kaikki | Kaikki |

Ensimmäinen ylläpitäjä luodaan sivulla `/kirjaudu`, kun kannassa ei ole käyttäjiä.

---

## API-rajapinta

Kaikki reitit polun `/api` alla, JSON, virheet `{ "error": "…" }`.

| Ryhmä | Reitit |
|---|---|
| Julkiset | `GET /public/overview`, `/leaderboard`, `/standings`, `/stats?pos=F\|D\|G`, `/coaches`, `/swap-days`, `/hall-of-fame`, `/teams` |
| Ilmoittautuminen | `GET /public/registration`, `POST /public/registration` |
| Kirjautuminen | `GET /auth/me`, `POST /auth/login`, `/auth/logout`, `/auth/password`, `/setup` |
| Guru | `GET /me/team`, `GET/PUT /me/draft-prefs`, `GET /draft` |
| Ylläpito | `/admin/overview`, `/admin/sync`, `/admin/season`, `/admin/registrations` (+ `/accept`, `/reject`), `/admin/users`, `/admin/gurus`, `/admin/slots`, `/admin/swaps` (+ `/undo`), `/admin/adjustments`, `/admin/coaches` (+ `/fire`), `/admin/swap-days`, `/admin/draft/*`, `/admin/hall-of-fame` |

---

## Kehitysympäristö

```bash
git clone https://github.com/Konderi/HogiGuru.git && cd HogiGuru
npm install
npm run db:migrate:local
npm run dev            # http://localhost:5173
```
Avaa `/kirjaudu` → luo ylläpitäjä → Ylläpito → **Päivitä tilastot**.

| Skripti | Kuvaus |
|---|---|
| `npm run dev` | Kehityspalvelin (frontend + Worker + paikallinen D1) |
| `npm run build` | Tuotantobuild |
| `npm run deploy` | Build + julkaisu |
| `npm run db:migrate:local` / `:remote` | Migraatiot |

---

## Julkaisu Cloudflareen

**API-avaimen oikeudet:** Workers Scripts · Edit, D1 · Edit, Account Settings · Read; zonelle konderi.fi Workers Routes · Edit ja DNS · Edit.

```bash
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...
npx wrangler d1 create hogiguru      # database_id → wrangler.jsonc
npm run db:migrate:remote
npm run deploy                       # → guru.konderi.fi
```
Jatkossa: `git pull && npm run deploy`. Uudet kantamuutokset tiedostoina `migrations/000N_….sql`.

**Varmuuskopio:** `npx wrangler d1 export hogiguru --remote --output backup.sql` (lisäksi D1 Time Travel 30 pv).

---

## Excel-tuonti

```bash
python3 tools/import_excel.py "data/HG All stars laskin 2026-2027.xlsx" 2027 > data/import.sql
npx wrangler d1 execute hogiguru --remote --file data/import.sql
```
Tuo gurut, kentälliset, vaihdot, valmentajat ja potkut. Nimet yhdistetään liiga.fi:n pelaajiin. Validointi: 52/53 gurua täsmäsi Excelin kanssa (ainoa ero johtui Excelin lähteen vanhentuneesta datasta). Excelin rakenne: [`docs/excel-analyysi.md`](docs/excel-analyysi.md).

---

## Ylläpitäjän ohje

**Ennen kautta:**
1. Pisteytys & kausi → tarkista säännöt.
2. Ilmoittautuminen → avaa lomake.
3. Hyväksy ilmoittautuneet guruiksi.
4. Päivitä tilastot.
5. Lisää valmentajat.
6. Kokoa draft-listat ja arvo järjestys.

**Draft-iltana:** ▶ Aloita → avaa `/draft` isolle näytölle → valinnat → ✓ Vie kentällisiin.

**Kauden aikana:** tilastot päivittyvät itsestään. Vaihtopäivinä vaihdot; tarvittaessa potkut ja korjaukset.

**Kauden lopussa:** mitalistit Hall of Fameen.

---

## Tietoturva

- PBKDF2-SHA256 (100 000 kierrosta, suola), vakioaikainen vertailu
- Istuntoeväste `HttpOnly; Secure; SameSite=Lax`, 30 vrk
- Kentälliset ja ilmoittautujien yhteystiedot vain ylläpidolle
- `data/` ja salaisuudet eivät ole versionhallinnassa

---

## Tiekartta

**Valmis ✅**
- Julkinen sivusto, kirjautuminen, ylläpito
- Ilmoittautuminen veikkauksineen
- Draft
- liiga.fi-synkronointi
- Excel-tuonti

**Seuraavaksi**
- [ ] Veikkausosion pisteiden automaattinen laskenta ja oma tulostaulu
- [ ] Pistekehityskäyrät
- [ ] Kausien hallinta
- [ ] GitHub Actions -julkaisu

**Myöhemmin**
- [ ] Hall of Fame -historian tuonti
- [ ] Workers AI -viikkokatsaukset
- [ ] Sähköposti-ilmoitukset

---

*HogiGuru – tehty lätkäfaneilta lätkäfaneille.* 🏒
