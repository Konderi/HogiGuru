# 🏒 HogiGuru

**HogiGuru – Liiga-veikkaus verkossa.** HogiGuru on kaveriporukan jääkiekkokisa, jossa kisaajat eli *gurut* veikkaavat kauden alussa runkosarjan lopputuloksen, joukkueiden parhaat pistemiehet ja pörssien voittajat. Lisäksi jokainen kokoaa draftissa oman All-Stars-kentällisensä Liigan pelaajista ja valmentajista. Kentällinen kerää pisteitä koko runkosarjan ajan pelaajien oikeiden tilastojen perusteella, ja sitä voi muuttaa sovittuina vaihtopäivinä.

Sivusto korvaa aiemman Excel-laskimen ja paperisen osallistumiskaavakkeen: tilastot päivittyvät automaattisesti suoraan liiga.fi:stä, ilmoittautuminen ja veikkaukset tehdään verkossa, gurut näkevät oman joukkueensa kirjautumalla, ja ylläpito hoitaa draftin, vaihdot ja pisteytyksen selaimessa.

🌐 **Tuotanto:** https://guru.konderi.fi
📦 **Repo:** https://github.com/Konderi/HogiGuru
📘 **Ohjeet:** [Gurut](docs/kayttoohje.md) · [Ylläpitäjät](docs/yllapitajan-ohje.md)

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
| Sama pelaaja voi olla valittuna enintään | valmentaja 5, maalivahti 5, puolustaja 5 ja hyökkääjä 4 kertaa | ✅ |
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
| Oma joukkue | `/oma-joukkue` | Kentällinen (kaukalo + valmentaja), pisteerittely, vaihdetut pelaajat, korjaukset, vaihtotoiveet varaustilanteineen, draft-ennakkolista, salasanan vaihto |
| Draft | `/draft` | Live-draft-taulu |

### Ylläpito (`/admin`)
| Osio | Toiminnot |
|---|---|
| Yleiskatsaus | Tilastopäivitys napista, päivitysloki, avainluvut |
| Ilmoittautuminen | Lomakkeen avaus/sulku, määräaika, maksu, lisätieto; ilmoittautuneet, veikkausten tarkastelu, hyväksyntä guruksi (+ tunnus), CSV-vienti |
| Draft | Listat, arvonta, live-valinnat, ennakkolistat, peruminen, vienti kentällisiin |
| Vaihdot | Vaihtopäivät kellonaikoineen, vaihtotoiveiden esikatselu ja käsittely, vaihtoloki, peruminen |
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
                    │  cron      → syncLiiga() iltaisin + yöllä    │
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
| Ajastus | Workers Cron Triggers (`*/30 18-21 * * *` ja `0 2 * * *` UTC) |
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
│   ├── 0002_registration.sql    ilmoittautuminen, valintarajat, kauden 26–27 säännöt ja vaihtopäivät
│   └── 0003_swap_requests.sql   vaihtotoiveet, vaihtopäivien käsittelytila
├── worker/                      BACKEND
│   ├── index.ts                 API-reitit, istunnot, cron
│   ├── data.ts                  kausi, leaderboard, varaukset, valintarajat
│   ├── scoring.ts               pisteytyskaavat
│   ├── draft.ts                 draft, automaattivalinta, vaihdot
│   ├── swaps.ts                 vaihtotoiveiden vuorojärjestys, esikatselu ja käsittely
│   ├── liiga.ts                 liiga.fi-synkronointi
│   └── auth.ts                  salasanat, istunnot
├── src/                         FRONTEND
│   ├── main.tsx, Layout.tsx, api.ts, auth.tsx, ui.tsx, index.css
│   ├── components/              DraftPrefs.tsx, SwapRequests.tsx
│   ├── pages/                   Home, Register, Leaderboard, Standings, Stats, HallOfFame, Login, MyTeam, DraftBoard
│   └── admin/                   AdminLayout, Dashboard, Registrations, Draft, Swaps, Gurus, Scoring, Coaches, Users, HallOfFame
├── tools/import_excel.py        kauden tuonti Excelistä
├── docs/
│   ├── kayttoohje.md            käyttöohje guruille
│   ├── yllapitajan-ohje.md      ylläpitäjän ohje
│   └── excel-analyysi.md        alkuperäisen Excelin analyysi
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

`{kausi}` = päättymisvuosi (2026–2027 → `2027`). Ajetaan iltaisin 30 min välein (n. klo 21–01 Suomen aikaa), kerran yöllä (n. klo 05) ja napista. Rajapinta on epävirallinen; muutokset korjataan tiedostoon `worker/liiga.ts`.

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

Vaihdot tehdään sivustolla **vaihtotoiveina**. Kellon kanssa ei tarvitse kilpailla.

1. Guru avaa **Oma joukkue → Vaihtotoiveet** ja lisää toiveet seuraavaan vaihtopäivään: lähtevä pelaaja + tulija ja halutessaan varavaihtoehdot järjestyksessä. Useamman vaihdon keskinäisen järjestyksen voi asettaa. Toiveita voi muokata vaihtopäivän loppuun (klo 21.00) asti, eivätkä muut näe niitä.
2. Vaihtopäivän päätyttyä ylläpito avaa **Ylläpito → Vaihdot → Toiveet**, näkee esikatselun ja painaa **Hyväksy ja toteuta**.
3. Käsittely tehdään **kierroksittain**: ensin jokaisen gurun 1. toive vuorojärjestyksessä, sitten 2. toive jne.
4. **Vuorojärjestys = draft-järjestys; joka toisena vaihtopäivänä käänteinen** (1. normaali, 2. käänteinen, 3. normaali, 4. käänteinen).
5. Jos tulija on jo täynnä (tai gurulla jo), otetaan seuraava varavaihtoehto. Jos mikään ei käy, vaihto ei toteudu eikä vaihtokertaa kulu. Edellisen gurun vaihdossa vapautunut pelaaja on heti seuraavien valittavissa.
6. Vaihtokiintiö (4) tarkistetaan; yksittäisen vaihdon voi perua vaihtolokista.

Ylläpito voi edelleen tehdä yksittäisiä vaihtoja käsin (**Gurut → ⇄ Vaihda**), esim. valmentajan potkujen yhteydessä.

**Potkut:** Valmentajat → Potkut (−10 p), sitten tarvittaessa vaihto.

---

## Käyttäjät ja oikeudet

| Rooli | Näkee | Voi tehdä |
|---|---|---|
| Vierailija | Julkiset sivut | Ilmoittautua |
| Guru | + oma kentällinen, draft | Ennakkolista, vaihtotoiveet, salasanan vaihto |
| Ylläpitäjä | Kaikki | Kaikki |

Ensimmäinen ylläpitäjä luodaan sivulla `/kirjaudu`, kun kannassa ei ole käyttäjiä.

---

## API-rajapinta

Kaikki reitit polun `/api` alla, JSON, virheet `{ "error": "…" }`.

| Ryhmä | Reitit |
|---|---|
| Julkiset | `GET /public/overview`, `/leaderboard`, `/standings`, `/stats?pos=F\|D\|G`, `/coaches`, `/players/search`, `/swap-days`, `/public/swaps`, `/hall-of-fame`, `/teams` |
| Ilmoittautuminen | `GET /public/registration`, `POST /public/registration` |
| Kirjautuminen | `GET /auth/me`, `POST /auth/login`, `/auth/logout`, `/auth/password`, `/setup` |
| Guru | `GET /me/team`, `GET/PUT /me/draft-prefs`, `GET/PUT /me/swaps`, `GET /draft` |
| Ylläpito | `/admin/overview`, `/admin/sync`, `/admin/season`, `/admin/registrations` (+ `/accept`, `/reject`), `/admin/users`, `/admin/gurus`, `/admin/slots`, `/admin/swaps` (+ `/undo`), `/admin/adjustments`, `/admin/coaches` (+ `/fire`), `/admin/swap-days` (+ `/:id/preview`, `/:id/process`), `/admin/draft/*`, `/admin/hall-of-fame` |

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
Jatkossa: `git pull && npm run deploy`. Uudet kantamuutokset tiedostoina `migrations/000N_….sql` → `npm run db:migrate:remote` ennen julkaisua.

**Nykyinen tuotanto:** Worker `hogiguru`, D1 `hogiguru` (EEUR, `29dc5201-…`), custom domain `guru.konderi.fi`, migraatiot 0001–0003 ajettu. Paikallisesti voi julkaista myös `npx wrangler login` -kirjautumisella ilman API-avainta.

**Varmuuskopio:** `npx wrangler d1 export hogiguru --remote --output backup.sql` (lisäksi D1 Time Travel 30 pv).

---

## Excel-tuonti

```bash
python3 tools/import_excel.py "data/HG All stars laskin 2026-2027.xlsx" 2027 > data/import.sql
npx wrangler d1 execute hogiguru --remote --file data/import.sql
```
Tuo gurut, kentälliset, vaihdot, valmentajat ja potkut. Nimet yhdistetään liiga.fi:n pelaajiin.

⚠️ Tuonti **korvaa** kauden gurut, kentälliset ja valmentajat. Sivustolla tehdyt muutokset niihin ylikirjoittuvat, ja tunnusten liitokset guruihin on tarkistettava tuonnin jälkeen (Ylläpito → Käyttäjät). Tunnukset ja tilastot säilyvät. Kaudella 2026–27 Excel on rinnakkainen päälähde; aja tuonnin jälkeen **Päivitä tilastot**.

Validointi: 52/53 gurua täsmäsi Excelin kanssa (ainoa ero johtui Excelin lähteen vanhentuneesta datasta).

### Hall of Fame (maratontaulukko)

```bash
python3 -m venv /tmp/xv && /tmp/xv/bin/pip install xlrd
/tmp/xv/bin/python tools/import_hof.py data/maratontaulukko.xls > data/hof.sql
npx wrangler d1 execute hogiguru --remote --file data/hof.sql
```
Tuo kaikkien kausien (2001–2026) sijoitukset ja gaalapaikat. Kauden maratonpisteet = (osallistujat + 1 − sija) / osallistujat × 100. Hall of Fame -sivu laskee niistä maratontaulukon, mestarit ja mitalit. Tuonti korvaa koko Hall of Famen. Excelin rakenne: [`docs/excel-analyysi.md`](docs/excel-analyysi.md).

---

## Ylläpitäjän ohje

📘 **Käyttöohjeet:**
- [Käyttöohje guruille](docs/kayttoohje.md): ilmoittautuminen, draft, vaihtotoiveet, varaustilanne
- [Ylläpitäjän ohje](docs/yllapitajan-ohje.md): kauden valmistelu, draft, vaihtopäivän käsittely, potkut, korjaukset, kertoimien muutos kesken kauden, ongelmatilanteet

Lyhyesti: ennen kautta säännöt → ilmoittautuminen → gurut ja tunnukset → valmentajat → draft. Kauden aikana tilastot päivittyvät itsestään, ja vaihtopäivien toiveet käsitellään esikatselun kautta. Kauden lopussa mitalistit Hall of Fameen.

⚠️ Pistekertoimet vaikuttavat **takautuvasti** koko kauden pisteisiin, myös jo pelattuihin peleihin. Muutoksen voi perua palauttamalla vanhat kertoimet, mutta niiden aikana käsitellyt vaihdot jäävät uusilla kertoimilla laskettuina. Älä siksi muuta kertoimia kesken kauden; ks. [ohjeen kohta 6](docs/yllapitajan-ohje.md#6-️-pistekertoimien-muuttaminen-kesken-kauden).

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
- Vaihtotoiveet kierroksittaisella käsittelyllä, varaustilanne pelaajahaussa
- liiga.fi-synkronointi
- Excel-tuonti
- Hall of Fame: maratontaulukko 2001–2026, mestarit, kausikohtaiset tulokset ja gaalapaikat
- Käyttö- ja ylläpito-ohjeet
- Tuotantojulkaisu (guru.konderi.fi, D1, ajastetut päivitykset) – lokakuu 2026

**Seuraavaksi**
- [ ] Sähköpostihälytys ylläpidolle, jos tilastopäivitys epäonnistuu
- [ ] Veikkausosion pisteiden automaattinen laskenta ja oma tulostaulu
- [ ] Pistekehityskäyrät
- [ ] Kausien hallinta
- [ ] GitHub Actions -julkaisu

**Myöhemmin**
- [ ] Workers AI -viikkokatsaukset
- [ ] Sähköposti-ilmoitukset

---

*HogiGuru – tehty lätkäfaneilta lätkäfaneille.* 🏒

## Kokonaistulokset ja valintatapa

- **Pimitys:** kauden aikana julkisesti näkyy vain All-Stars. Veikkauskategoriat (sarjataulukko, joukkueiden pistemiehet, kategoriat) lasketaan `worker/predictions.ts`:ssä, mutta `/api/results` palauttaa ne vasta kun `seasons.results_published = 1`.
- **Ylläpito → Kokonaistulokset:** esikatselu eriteltynä, julkaisukytkin, käsikorjaukset oikeisiin vastauksiin (`results_override`, JSON) ja tallennus Hall of Fameen.
- **Valintatapa** (Ylläpito → Ilmoittautuminen): `draft` (toivelistat + valintajärjestys) tai `baskets` (korit: yksi valinta per kori, kentällinen syntyy suoraan hyväksynnässä).
