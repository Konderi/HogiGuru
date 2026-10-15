# 🏒 HogiGuru

**HogiGuru – Liiga-veikkaus verkossa.** HogiGuru on kaveriporukan jääkiekkokisa, jossa kisaajat eli *gurut* veikkaavat kauden alussa runkosarjan lopputuloksen, joukkueiden parhaat pistemiehet ja pörssien voittajat. Lisäksi jokainen kokoaa draftissa oman All-Stars-kentällisensä Liigan pelaajista ja valmentajista. Kentällinen kerää pisteitä koko runkosarjan ajan pelaajien oikeiden tilastojen perusteella, ja sitä voi muuttaa sovittuina vaihtopäivinä.

Sivusto korvaa aiemman Excel-laskimen ja paperisen osallistumiskaavakkeen: tilastot päivittyvät automaattisesti suoraan liiga.fi:stä, ilmoittautuminen ja veikkaukset tehdään verkossa, gurut näkevät oman joukkueensa kirjautumalla, ja ylläpito hoitaa draftin, vaihdot ja pisteytyksen selaimessa.

🌐 **Tuotanto:** https://guru.konderi.fi
📦 **Repo:** https://github.com/Konderi/HogiGuru
📘 **Ohjeet:** [Gurut](docs/kayttoohje.md) · [Ylläpitäjät](docs/yllapitajan-ohje.md) · [Domainin vaihto](docs/domainin-vaihto.md) · [Tietoturva](docs/tietoturva.md)

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
12. [Varmistukset, sähköposti ja muutoshistoria](#varmistukset-sähköposti-ja-muutoshistoria)
13. [Kokonaistulokset ja gaala](#kokonaistulokset-ja-gaala)
14. [API-rajapinta](#api-rajapinta)
15. [Kehitysympäristö](#kehitysympäristö)
16. [Julkaisu Cloudflareen](#julkaisu-cloudflareen)
17. [Excel-tuonti](#excel-tuonti)
18. [Ylläpitäjän ohje](#ylläpitäjän-ohje)
19. [Tietoturva](#tietoturva)
20. [Tiekartta](#tiekartta)

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
- Valmentajan potkuista guru saa −10 p ja voi valita uuden valmentajan **heti itse** (Oma joukkue). Tämä ei vaadi vaihtopäivää eikä kuluta vaihtokiintiötä. Jos ei vaihda, saman joukkueen uusi valmentaja jatkaa pisteiden keräämistä.
- Pelaajille ei ole poikkeuksia: Liigasta lähtenyt pelaaja vaihdetaan normaalisti seuraavana vaihtopäivänä.
- Vaihdot tehdään vaihtopäivänä sivustolla vaihtotoiveina, ja ylläpito käsittelee ne päivän päätyttyä.
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
| Gurukierros | `/gurukierros` | Viikkokatsaus (ma–su, oletuksena kuluva viikko): viikon parhaat gurut, tähdet, huippupelit, suosikkipelaajat, "olisi kannattanut". Vaihtojen kuningas: vaihtojen nettovaikutus. Kentällisiä ei paljasteta |
| Sarjataulukko | `/sarjataulukko` | Liigan runkosarja |
| Tilastot | `/tilastot` | Pelaajat ja valmentajat HG-pisteineen, lajittelu sarakkeista, varaustilanne, "vain vapaat" -suodatin, pelaajakortti klikkaamalla |
| Kokonaistulokset | `/kokonaistulokset` | All-Stars + veikkauskategoriat; veikkausosa pimitetty, kunnes ylläpito julkaisee gaalassa |
| Hall of Fame | `/hall-of-fame` | Maratontaulukko 2001–, mestarit, kausikohtaiset tulokset |
| Joukkue | `/joukkue/:id` | Joukkuesivu: ottelut, vire, koti/vieras, pistepörssi, maalivahdit, valmentaja, HogiGuru-nurkka (liiga.fi-otteluohjelma 10 min välimuistissa) |
| Tietosuoja | `/tietosuoja` | Tietosuojaseloste (GDPR) |
| Draft-seinänäkymä | `/draft/naytto` | Heijastettava näkymä: aula, arvonta, varaustilanne, draft-taulu, vuorossa oleva guru. `?harjoitus` = harjoitustila (BroadcastChannel hallintaikkunasta) |
| Kirjaudu / Unohtunut salasana | `/kirjaudu`, `/unohtunut`, `/salasana?t=` | Kirjautuminen ja salasanan palautus sähköpostilinkillä |

### Gurun näkymät (kirjautunut)
| Sivu | Polku | Sisältö |
|---|---|---|
| Oma joukkue | `/oma-joukkue` | Kentällinen (pystypuolikaukalo SVG:nä – `src/components/HalfRink.tsx` – pelaajat paikoillaan + valmentaja penkillä), ottelukohtaiset HG-pisteet klikkaamalla pelaajaa, pisteerittely, vaihdetut pelaajat, korjaukset, uuden valmentajan valinta potkujen jälkeen, vaihtotoiveet varaustilanteineen, draft-ennakkolista, suosikkijoukkue, sähköposti-ilmoitukset, salasanan vaihto |
| Draft | `/draft` | Live-draft-taulu (yläpalkissa, kun ylläpito ei ole piilottanut) |

### Ylläpito (`/admin`)
| Osio | Toiminnot |
|---|---|
| Yleiskatsaus | Tilastopäivitys napista, päivitysloki, avainluvut |
| Ilmoittautuminen | Lomakkeen avaus/sulku, määräaika, maksu, lisätieto, valintatapa (draft/korit); ilmoittautuneet, veikkausten tarkastelu, hyväksyntä guruksi (+ tunnus, liitos aiempaan guruun), CSV-vienti |
| Draft | Listat, läsnäolo, animoitu arvonta (tauko), live-valinnat, ennakkolistat, peruminen, tarkistus ja korjaus, hyväksyntä ja julkaisu kentällisiin, yläpalkin näkyvyys, harjoitusdraft (`/admin/draft/harjoitus`) |
| Vaihdot | Vaihtopäivät kellonaikoineen, vaihtotoiveiden esikatselu ja käsittely, vaihtoloki, peruminen |
| Gurut & kentälliset | Gurut, kentälliset, vaihdot, paikkojen muokkaus, pistekorjaukset |
| Pisteytys & kausi | Kertoimet, kentällisen koko, valintarajat paikoittain, vaihtojen määrä, veikkausosion pisteet |
| Valmentajat | Valmentajat, potkut |
| Käyttäjät | Tunnukset, roolit (guru / ylläpitäjä / pääylläpitäjä), salasanat, liitos guruun |
| Kokonaistulokset | Veikkausosan esikatselu, oikeiden vastausten korjaus, julkaisu, gaalaesitys, tallennus Hall of Fameen |
| Hall of Fame | Historiatulokset |
| Tekninen ylläpito | *Vain pääylläpitäjä:* järjestelmän tila, varmistukset (R2), sähköpostit ja lähetysloki, muutoshistoria |

Koko sivusto on optimoitu mobiilille: taulukot vierivät sivuttain kortin sisällä, ponnahdusikkunat avautuvat alapaneelina, kenttien 16 px fontti estää iOS-zoomauksen.

---

## Arkkitehtuuri

```
                    ┌──────────────────────────────────────────────┐
  Selain ──────────▶│  Cloudflare Worker  (guru.konderi.fi)        │
                    │  /*        → staattiset tiedostot (React SPA)│
                    │  /api/*    → Hono-API (worker/index.ts)      │
                    │  cron      → tilastot, varmistus, raportit   │
                    └───┬──────────────┬─────────────┬─────────┬───┘
                 ┌──────▼──────┐ ┌─────▼──────┐ ┌────▼─────┐ ┌─▼──────────┐
                 │ D1 (SQLite) │ │ R2         │ │ Resend   │ │ liiga.fi   │
                 │ hogiguru    │ │ varmistukset│ │ sähköposti│ │ /api/v2    │
                 └─────────────┘ └────────────┘ └──────────┘ └────────────┘
```

| Kerros | Teknologia |
|---|---|
| Frontend | React 19, React Router, Vite, Tailwind CSS v4 |
| Backend | Cloudflare Workers + [Hono](https://hono.dev) |
| Tietokanta | Cloudflare D1 (SQLite) |
| Varmistukset | Cloudflare R2 (`hogiguru-backups`, binding `BACKUPS`) |
| Sähköposti | [Resend](https://resend.com), lähettäjä `no-reply@konderi.fi` |
| Ajastus | Workers Cron Triggers (`*/30 * * * *`), worker rajaa ajot Suomen aikaan (ks. alla) |
| Kirjautuminen | PBKDF2-salasanat + HttpOnly-istuntoeväste, palautus sähköpostilinkillä |
| Build | `@cloudflare/vite-plugin` |

Frontend ja API julkaistaan **yhtenä Workerina**; vain `/api/*` ohjataan koodille (`run_worker_first`).

**Ajastetut tehtävät (Suomen aikaa):**

| Aika | Tehtävä |
|---|---|
| 17.00–23.00 puolen tunnin välein, lisäksi 05.00 ja 11.00 | Täysi tilastopäivitys liiga.fi:stä + vanhojen istuntojen siivous |
| Muulloin 30 min välein | Ottelulokin täydennys (max 12 ottelua / ajo) |
| 03.00 | Tietokannan varmistus R2:een + vanhojen varmistusten siivous |
| 07.00 | Ylläpitoraportti pääylläpitäjille |
| ma 09.00 | Gurukierros-viikkokatsaus guruille |

**Ilme:** tumma jäähalliteema, jäänsininen korostus, maalivalon punainen, kaukalon viivat taustalla, tulostaulumainen numerofontti. Responsiivinen, mobiili ensisijainen.

---

## Hakemistorakenne

```
HogiGuru-app/
├── wrangler.jsonc               Cloudflare-konfiguraatio (D1, R2, cron, domain, MAIL_FROM)
├── vite.config.ts
├── migrations/
│   ├── 0001_init.sql            tietokantarakenne + oletuspisteytys
│   ├── 0002_registration.sql    ilmoittautuminen, valintarajat, kauden 26–27 säännöt ja vaihtopäivät
│   ├── 0003_swap_requests.sql   vaihtotoiveet, vaihtopäivien käsittelytila
│   ├── 0004_registration_draft.sql  ilmoittautumisen draft-toiveet
│   ├── 0005_results_baskets.sql kokonaistulosten julkaisu, valintatapa (draft/korit)
│   ├── 0006_game_stats.sql      ottelukohtaiset tilastot
│   ├── 0007_audit_mail.sql      muutoshistoria, sähköpostiloki, sähköpostiasetukset
│   ├── 0008_maintainer.sql      pääylläpitäjä-oikeus
│   ├── 0009_password_resets.sql salasanan palautuslinkit
│   ├── 0010_rate_limits.sql     kirjautumisen ja lomakkeiden yritysrajoitus
│   ├── 0011_draft_lottery.sql   animoitu arvonta (aloitusaika, arvontajärjestys)
│   ├── 0012_fav_team.sql        käyttäjän suosikkijoukkue
│   ├── 0013_lottery_pause.sql   arvonnan tauko
│   ├── 0014_draft_nav.sql       Draft-linkin näkyvyys yläpalkissa
│   ├── 0015_playoff.sql         pudotuspelitilastot, kauden tyyppi (playoff)
│   ├── 0016_playoff_reg.sql     Play-Off-ilmoittautuminen, mestariveikkaus
│   └── 0017_playoff_rosters.sql Play-Off-kokoonpanot, ottelutilastot, vaihtoikkuna
├── worker/                      BACKEND
│   ├── index.ts                 API-reitit, istunnot, roolit, cron
│   ├── data.ts                  kausi, leaderboard, varaukset, valintarajat
│   ├── scoring.ts               pisteytyskaavat
│   ├── draft.ts                 draft, automaattivalinta, vaihdot, vaihtokiintiö
│   ├── swaps.ts                 vaihtotoiveiden vuorojärjestys, esikatselu ja käsittely
│   ├── weekly.ts                Gurukierros: viikkokatsaus, vaihtojen analyysi
│   ├── predictions.ts           veikkausosion pisteet
│   ├── liiga.ts                 liiga.fi-synkronointi (tilastot + ottelut)
│   ├── backup.ts                SQL-dump R2:een, säilytys ja listaus
│   ├── mail.ts                  Resend-lähetys, HTML-pohja
│   ├── reports.ts               viikkokatsaus- ja ylläpitoraporttisähköpostit
│   └── auth.ts                  salasanat, istunnot
├── src/                         FRONTEND
│   ├── main.tsx, Layout.tsx, api.ts, auth.tsx, ui.tsx, index.css, draftLogic.ts (harjoitusdraftin selainlogiikka)
│   ├── components/              HalfRink, GameLog, PlayerCard, CoachReplace, DraftPrefs, SwapRequests, ResultsView, GalaReveal, GoldConfetti
│   ├── pages/                   Home, Register, Leaderboard, Gurukierros, Standings, Stats, Results, HallOfFame, Login, PasswordReset, MyTeam, DraftBoard, DraftScreen, Team, Privacy
│   └── admin/                   AdminLayout, Dashboard, Registrations, Draft, DraftPractice, Swaps, Gurus, Scoring, Coaches, Users, Results, HallOfFame, Maintenance
├── tools/
│   ├── import_excel.py          kauden tuonti Excelistä
│   └── import_hof.py            Hall of Fame -maratontaulukon tuonti
├── docs/
│   ├── kayttoohje.md            käyttöohje guruille
│   ├── yllapitajan-ohje.md      ylläpitäjän ohje
│   ├── domainin-vaihto.md       tarkistuslista oman domainin käyttöönottoon
│   ├── tietoturva.md            tietoturvakartoitus ja suositukset
│   └── excel-analyysi.md        alkuperäisen Excelin analyysi
└── data/                        EI versionhallinnassa (Excelit, kaavake)
```

---

## Tietomalli

| Taulu | Tarkoitus |
|---|---|
| `users`, `sessions` | Tunnukset (`role` admin/guru + `maintainer`-lippu = pääylläpitäjä, `email_prefs`, `unsub_token`, `fav_team`) ja istunnot |
| `password_resets` | Salasanan palautuslinkit (vain SHA-256-tiiviste, 60 min, kertakäyttöinen) |
| `seasons` | Kausi: säännöt, kentällinen, pisteytys (JSON), valintarajat paikoittain, draftin tila, arvonta (`draft_lottery_at`, `draft_lottery_paused`), `draft_nav`, ilmoittautumisen asetukset, valintatapa, tulosten julkaisu |
| `teams`, `players`, `player_stats`, `standings` | liiga.fi-data |
| `game_stats`, `team_games`, `games_synced` | Ottelukohtaiset tilastot pelilokia ja Gurukierrosta varten |
| `coaches` | Valmentajat + potkut |
| `gurus` | Kisaajat, linkki tunnukseen, draft-numero, `remote_draft` (ei paikalla), `lottery_order` |
| `roster_slots` | **Kentällisen paikat** aikaväleittäin |
| `adjustments` | Pistekorjaukset |
| `swap_days`, `swap_requests` | Vaihtopäivät (päivä, kellonajat, käsittelytila) ja gurujen vaihtotoiveet |
| `registrations` | Ilmoittautumiset: yhteystiedot, veikattu sarjataulukko, parhaat pistemiehet, kategoriat, tila |
| `draft_pool`, `draft_picks`, `draft_prefs` | Draft |
| `leaderboard_history` | Päivittäiset sijat |
| `hall_of_fame` | Aiemmat kaudet |
| `sync_log` | Päivitysloki |
| `audit_log` | Muutoshistoria (ylläpidon ja gurujen muuttavat pyynnöt) |
| `mail_log` | Sähköpostien lähetysloki |
| `rate_limits` | Kirjautumis-, palautus- ja ilmoittautumisyritysten laskurit (siivotaan vuorokauden jälkeen) |

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

Veikkaukset tallennetaan ilmoittautumisen yhteydessä ja pisteet lasketaan automaattisesti (`worker/predictions.ts`); ne näkyvät julkisesti vasta kun ylläpito julkaisee kokonaistulokset.

Kaikki kertoimet: Ylläpito → Pisteytys & kausi. Koodi: [`worker/scoring.ts`](worker/scoring.ts).

---

## Tilastojen haku liiga.fi:stä

| Data | Osoite |
|---|---|
| Kenttäpelaajat | `https://liiga.fi/api/v2/players/stats/summed/{kausi}/{kausi}/runkosarja/true?dataType=basicStats` |
| Maalivahdit | `…?dataType=basicStatsGk` |
| Sarjataulukko | `https://liiga.fi/api/v2/standings/?season={kausi}` |
| Ottelut (pelilokiin) | `…/games?tournament=runkosarja&season={kausi}`, `…/games/{kausi}/{id}`, `…/games/stats/{kausi}/{id}` |

Ottelukohtainen loki: synkka käsittelee enintään 12 uutta päättynyttä ottelua kerrallaan tauluihin `game_stats` (pelaajat), `team_games` (joukkueen pisteet, valmentajille) ja `games_synced` (migraatio 0006). Frontend hakee `GET /api/game-log/:id?pos=F|D|G|C`. Maalivahtien torjunnat, päästetyt ja peliaika tulevat tarkkoina erätilastoista (`goaliePeriodStats`).

`{kausi}` = päättymisvuosi (2026–2027 → `2027`). Ajastus: ks. [Arkkitehtuuri](#arkkitehtuuri); lisäksi napista. Rajapinta on epävirallinen; muutokset korjataan tiedostoon `worker/liiga.ts`.

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

1. **Valmistelu:** gurut, draft-listat paikoittain, läsnäolo (poissaolevilla oltava lomake)
2. **Arvonta 🎲:** `POST /admin/draft/shuffle {animate}` – numerot arvotaan heti, mutta `draftState` piilottaa ne (ja järjestyksen) kunnes arvonta paljastaa ne (10 s/guru, paljastus 4 s). Tauko `POST /admin/draft/lottery {action}`
3. **Ennakkolistat:** etäosallistuja antaa paikkajärjestyksen (esim. `H, MV, P, V, H, P, H`) ja toivelistat
4. **Live:** käynnistetään erikseen (`/admin/draft/status`, estetty arvonnan aikana ja jos lomake puuttuu). Vuorossa oleva guru valitsee minkä tahansa paikan pelaajan; ⚙ valinta ennakkolistalta; ↶ peru
5. **Tarkistus:** kaikkien valintojen jälkeen tila on yhä `live`; yksittäistä valintaa voi korjata `PUT /admin/draft/pick/:no {entity_id}` (`replacePick`)
6. **Julkaisu:** `POST /admin/draft/finalize` – varmistus, valinnat `roster_slots`-tauluun, tila `done`. Vasta tämän jälkeen joukkueet näkyvät guruille

Tarkistukset: pelaaja listalla, paikka ei täynnä, ei tuplavalintaa, paikkakohtainen enimmäismäärä (H 4, muut 5). Käärmedraft valinnainen.

**Seinänäkymä** `/draft/naytto` pollaa `/api/draft` (3 s, arvonnan aikana 1 s) ja vaihtaa näkymää tilan mukaan. **Harjoitusdraft** `/admin/draft/harjoitus` ajaa koko kulun selaimessa (`src/draftLogic.ts`) ja lähettää tilan seinänäkymälle (`?harjoitus`) BroadcastChannelilla; mitään ei tallenneta.

---

## Vaihdot

Vaihdot tehdään sivustolla **vaihtotoiveina**. Kellon kanssa ei tarvitse kilpailla.

1. Guru avaa **Oma joukkue → Vaihtotoiveet** ja lisää toiveet seuraavaan vaihtopäivään: lähtevä pelaaja + tulija ja halutessaan varavaihtoehdot järjestyksessä. Useamman vaihdon keskinäisen järjestyksen voi asettaa. Toiveita voi muokata vaihtopäivän loppuun (klo 21.00) asti, eivätkä muut näe niitä.
2. Vaihtopäivän päätyttyä ylläpito avaa **Ylläpito → Vaihdot → Toiveet**, näkee esikatselun ja painaa **Hyväksy ja toteuta**.
3. Käsittely tehdään **kierroksittain**: ensin jokaisen gurun 1. toive vuorojärjestyksessä, sitten 2. toive jne.
4. **Vuorojärjestys = draft-järjestys; joka toisena vaihtopäivänä käänteinen** (1. normaali, 2. käänteinen, 3. normaali, 4. käänteinen).
5. Jos tulija on jo täynnä (tai gurulla jo), otetaan seuraava varavaihtoehto. Jos mikään ei käy, vaihto ei toteudu eikä vaihtokertaa kulu. Edellisen gurun vaihdossa vapautunut pelaaja on heti seuraavien valittavissa.
6. Vaihtokiintiö (4) tarkistetaan; yksittäisen vaihdon voi perua vaihtolokista.

Ylläpito voi edelleen tehdä yksittäisiä vaihtoja käsin (**Gurut → ⇄ Vaihda**).

Ennen vaihtopäivän käsittelyä otetaan automaattisesti tapahtumavarmistus R2:een.

**Potkut:** Ylläpito → Valmentajat → Potkut (−10 p kaikille, joilla valmentaja on). Gurun Oma joukkue -sivulle ilmestyy valintalaatikko (`POST /api/me/coach`), josta hän valitsee uuden valmentajan heti. Tämä vaihto ei kuluta vaihtokiintiötä (`COUNTED_SWAP`-ehto `worker/draft.ts`:ssä).

---

## Käyttäjät ja oikeudet

| Rooli | Näkee | Voi tehdä |
|---|---|---|
| Vierailija | Julkiset sivut | Ilmoittautua |
| Guru | + oma kentällinen, draft | Ennakkolista, vaihtotoiveet, valmentajan valinta potkujen jälkeen, sähköpostiasetukset, salasanan vaihto ja palautus |
| Ylläpitäjä | Ylläpito (`/admin`) | Pelin hallinta: draft, vaihdot, gurut, pisteytys, valmentajat, käyttäjät |
| Pääylläpitäjä | + Tekninen ylläpito (`/admin/yllapito`) | Varmistukset (R2), sähköposti, muutoshistoria, järjestelmän tila; vain pääylläpitäjä voi nimetä toisen pääylläpitäjän |

Ensimmäinen käyttäjä luodaan sivulla `/kirjaudu` pääylläpitäjäksi, kun kannassa ei ole käyttäjiä.
Pääylläpitäjä = `users.role = 'admin'` + `users.maintainer = 1` (migraatio 0008). Tekninen API: `/api/admin/maint/*`. Uuden ylläpitäjän lisäys: Ylläpito → Käyttäjät → rooli.

---

## Varmistukset, sähköposti ja muutoshistoria

Hallinta: **Ylläpito → Tekninen ylläpito** (vain pääylläpitäjä).

### Varmistukset (Cloudflare R2)
| Tyyppi | Milloin | Säilytys |
|---|---|---|
| `daily/YYYY-MM-DD.sql` | joka yö klo 03 | 30 pv, kuun 1. päivän varmistus pysyvästi |
| `event/<aika>-<syy>.sql` | ennen vaihtopäivän käsittelyä ja draftin vientiä kentällisiin | 90 pv |
| `manual/<aika>.sql` | napista *Tee varmistus nyt* | pysyvästi |

Varmistus on koko kannan SQL-dump (rakenne + data, istunnot pois lukien). Lisäksi D1 Time Travel palauttaa minkä tahansa hetken 30 päivän ajalta.

**Palautus:**
1. Lataa `.sql` Tekninen ylläpito → Varmistukset -sivulta.
2. Pienet korjaukset: poimi tarvittavat `INSERT`-rivit ja aja `npx wrangler d1 execute hogiguru --remote --command "…"`.
3. Koko kanta: luo tyhjä D1 (`npx wrangler d1 create hogiguru-restore`), aja `npx wrangler d1 execute hogiguru-restore --remote --file=varmistus.sql`, tarkista ja vaihda `database_id` `wrangler.jsonc`:iin → `npm run deploy`.
4. Vaihtoehto: `npx wrangler d1 time-travel restore hogiguru --timestamp=<ISO-aika>`.

### Sähköposti (Resend)
- Asetukset: salaisuus `RESEND_API_KEY` (Cloudflare → Workers → hogiguru → Settings → Variables and Secrets, tyyppi *Secret*) ja `MAIL_FROM` (`wrangler.jsonc`, `HogiGuru <no-reply@konderi.fi>`). Resendissä vahvistettu domain: `konderi.fi`.
- **Viikkokatsaus** guruille ma klo 9: oman viikon pisteet ja sijoitus + Gurukierroksen kooste. Sama viikko lähetetään kullekin vain kerran.
- **Ylläpitoraportti** pääylläpitäjille klo 7: tilastopäivitykset, yön varmistus, lähetetyt viestit, uudet ilmoittautumiset, muutosten määrä.
- **Salasanan palautus:** `/unohtunut` → `POST /api/auth/forgot` lähettää kertakäyttöisen linkin `/salasana?t=…` (60 min, tokenista tallennetaan vain SHA-256, max 3 pyyntöä/h/käyttäjä, vastaus aina sama). Vaihto mitätöi käyttäjän kaikki istunnot ja muut linkit.
- **Peruutus:** jokaisessa viikkokatsauksessa linkki ja `List-Unsubscribe`-otsake (`/api/unsubscribe?t=`); guru voi myös säätää asetuksen Oma joukkue → Sähköposti-ilmoitukset.
- Kaikki lähetykset kirjautuvat `mail_log`-tauluun (näkyy Tekninen ylläpito → Sähköposti).

### Muutoshistoria
`audit_log` tallentaa kaikki ylläpidon (`/api/admin/*`) ja gurujen (`/api/me/*`) muuttavat pyynnöt: aika, käyttäjä, toiminto, sisältö (salasanat peitetty) ja tulos.

---

## Kokonaistulokset ja gaala

- **Pimitys:** kauden aikana julkisesti näkyy vain All-Stars. Veikkauskategoriat (sarjataulukko, joukkueiden pistemiehet, pörssit) lasketaan `worker/predictions.ts`:ssä, mutta `/api/results` palauttaa ne vasta kun `seasons.results_published = 1`.
- **Ylläpito → Kokonaistulokset:** esikatselu eriteltynä, julkaisukytkin, käsikorjaukset oikeisiin vastauksiin (`results_override`, JSON) ja tallennus Hall of Fameen.
- **Gaalaesitys** 🎬: koko näytön vaiheittainen tulosten paljastus, ks. [ylläpitäjän ohje](docs/yllapitajan-ohje.md#gaalaesitys).
- **Valintatapa** (Ylläpito → Ilmoittautuminen): `draft` (toivelistat + valintajärjestys) tai `baskets` (korit: yksi valinta per kori, kentällinen syntyy suoraan hyväksynnässä).

---

## Play-Off-kisa

Erillinen sivukisa pudotuspeleihin (`/playoff`, toistaiseksi näkyvissä vain ylläpitäjille). Ks. [suunnitelma](docs/playoff-suunnitelma.md).

- **Kausi:** oma `seasons`-rivi (`kind = 'playoff'`, `parent_season_id`), pisteytys kopioidaan emokaudelta.
- **Joukkue:** 3 H, 2 P, 1 MV, valinta lomakkeella (`draft_status`: `setup` → `live` → `done`). Draftissa valintarajat (oletus H 8 / P 8 / MV 12), vaihdoissa ei.
- **Pisteet:** `playoff_game_stats`, vain puolivälierät, välierät ja finaali (liigan vaiheet 2, 3, 5). Lasketaan `playoff_slots`-rivien voimassaoloajalta.
- **Vaihdot:** 4 kpl + ilmaiset pudonneen joukkueen pelaajista. Ikkuna aukeaa automaattisesti kun kierroksen sarjat ovat ratkenneet, sulkeutuu 2 h ennen seuraavan kierroksen 1. ottelua (`swap_open` ylikirjoittaa: 1 auki / −1 kiinni).
- **Mestariveikkaus** on kunniakysymys. Ei gaalaa – top 3 tallennetaan Hall of Fameen Hallinta-välilehdeltä.
- Koodi: `worker/playoff.ts` (hakemistopuu), `worker/playoffGame.ts` (kokoonpanot, pisteet, leaderboard, vaihtoikkuna), `src/pages/Playoff.tsx`.

---

## API-rajapinta

Kaikki reitit polun `/api` alla, JSON, virheet `{ "error": "…" }`.

| Ryhmä | Reitit |
|---|---|
| Julkiset | `GET /public/overview`, `/leaderboard`, `/leaderboard/history`, `/standings`, `/stats?pos=F\|D\|G`, `/coaches`, `/teams`, `/players/search`, `/players/:id/info`, `/game-log/:id?pos=`, `/swap-days`, `/public/swaps`, `/weekly?week=`, `/swap-analysis`, `/results`, `/hall-of-fame`, `GET/POST /unsubscribe?t=` |
| Ilmoittautuminen | `GET /public/registration`, `POST /public/registration` |
| Kirjautuminen | `GET /auth/me`, `POST /auth/login`, `/auth/logout`, `/auth/password`, `/auth/forgot`, `GET/POST /auth/reset`, `POST /setup` |
| Guru | `GET /me/team`, `GET/PUT /me/draft-prefs`, `GET/PUT /me/swaps`, `POST /me/coach`, `GET/PUT /me/email-prefs`, `GET /draft` |
| Ylläpito | `/admin/overview`, `/admin/sync`, `/admin/season`, `/admin/registrations` (+ `/:id/accept`, `/:id/reject`, `/:id/matches`), `/admin/users`, `/admin/gurus` (+ `/:id/team`, `/:id/draft-prefs`), `/admin/slots`, `/admin/swaps` (+ `/:id/undo`), `/admin/adjustments`, `/admin/coaches` (+ `/:id/fire`), `/admin/swap-days` (+ `/:id/preview`, `/:id/process`), `/admin/draft/*`, `/admin/results` (+ `/override`, `/hall-of-fame`), `/admin/hall-of-fame` |
| Tekninen ylläpito | `/admin/maint/status`, `/admin/maint/backups` (+ `/file?key=`), `/admin/maint/audit`, `/admin/maint/mail-log`, `/admin/maint/mail/test`, `/admin/maint/mail/weekly`, `/admin/maint/mail/admin-report` |

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

**API-avaimen oikeudet:** Workers Scripts · Edit, D1 · Edit, Workers R2 Storage · Edit, Account Settings · Read; zonelle konderi.fi Workers Routes · Edit ja DNS · Edit.

```bash
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...
npx wrangler d1 create hogiguru            # database_id → wrangler.jsonc
npx wrangler r2 bucket create hogiguru-backups
npx wrangler secret put RESEND_API_KEY     # Resendin API-avain
npm run db:migrate:remote
npm run deploy                             # → guru.konderi.fi
```
Jatkossa: `git pull && npm run deploy`. Uudet kantamuutokset tiedostoina `migrations/000N_….sql` → `npm run db:migrate:remote` ennen julkaisua.

**Nykyinen tuotanto:** Worker `hogiguru`, D1 `hogiguru` (EEUR, `29dc5201-…`), R2 `hogiguru-backups`, custom domain `guru.konderi.fi`, Resend-domain `konderi.fi`, migraatiot 0001–0010 ajettu. Paikallisesti voi julkaista myös `npx wrangler login` -kirjautumisella ilman API-avainta.

**Käsin varmistus komentoriviltä:** `npx wrangler d1 export hogiguru --remote --output backup.sql` (automaattiset varmistukset: ks. [Varmistukset](#varmistukset-sähköposti-ja-muutoshistoria)).

**Domainin vaihto** omaan osoitteeseen: [docs/domainin-vaihto.md](docs/domainin-vaihto.md).

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
- [Käyttöohje guruille](docs/kayttoohje.md): ilmoittautuminen, kirjautuminen ja salasanan palautus, draft, oma joukkue, Gurukierros, vaihtotoiveet, potkut, sähköposti-ilmoitukset
- [Ylläpitäjän ohje](docs/yllapitajan-ohje.md): roolit, kauden valmistelu, draft, vaihtopäivän käsittely, potkut, korjaukset, kertoimien muutos kesken kauden, kauden päätös ja gaala, tekninen ylläpito, ongelmatilanteet
- [Domainin vaihto](docs/domainin-vaihto.md): siirto guru.konderi.fi → oma domain (Cloudflare, Resend, uudelleenohjaus, istunnot, testaus)

Lyhyesti: ennen kautta säännöt → ilmoittautuminen → gurut ja tunnukset → valmentajat → draft. Kauden aikana tilastot, varmistukset ja sähköpostit hoituvat itsestään, ja vaihtopäivien toiveet käsitellään esikatselun kautta. Kauden lopussa kokonaistulokset gaalassa ja Hall of Fameen.

⚠️ Pistekertoimet vaikuttavat **takautuvasti** koko kauden pisteisiin, myös jo pelattuihin peleihin. Muutoksen voi perua palauttamalla vanhat kertoimet, mutta niiden aikana käsitellyt vaihdot jäävät uusilla kertoimilla laskettuina. Älä siksi muuta kertoimia kesken kauden; ks. [ohjeen kohta 6](docs/yllapitajan-ohje.md#6-️-pistekertoimien-muuttaminen-kesken-kauden).

---

## Tietoturva

Koko kartoitus ja avoimet suositukset: [docs/tietoturva.md](docs/tietoturva.md).

- PBKDF2-SHA256 (100 000 kierrosta, suola), vakioaikainen vertailu
- Yritysrajoitus: kirjautuminen 10 virhettä / tunnus ja 30 / IP / 15 min, palautuspyynnöt ja ilmoittautumiset / IP / tunti (`rate_limits`)
- CSRF: muuttavat pyynnöt vain omasta originista; tietoturvaotsakkeet (CSP, HSTS, X-Frame-Options, nosniff) `public/_headers`-tiedostossa
- Tekniset virheet eivät näy käyttäjälle; sivusto vain omassa domainissa (`workers_dev: false`)
- Istuntoeväste `HttpOnly; Secure; SameSite=Lax`, 30 vrk; salasanan vaihto palautuslinkillä kirjaa ulos kaikilta laitteilta
- Palautuslinkit kertakäyttöisiä, 60 min, kannassa vain tiiviste; pyyntöjen määrä rajattu eikä vastaus paljasta tunnusten olemassaoloa
- Roolit: guru / ylläpitäjä / pääylläpitäjä; tekninen ylläpito vain pääylläpitäjälle, omaa roolia ei voi poistaa
- Muutoshistoria kaikista muuttavista ylläpito- ja guruoperaatioista
- Kentälliset ja ilmoittautujien yhteystiedot vain ylläpidolle
- `data/` ja salaisuudet (`RESEND_API_KEY`) eivät ole versionhallinnassa

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
- Ottelukohtaiset HG-pisteet (pelaajan peliloki), pelaajakortti, tilastojen lajittelu
- Gurukierros: viikkokatsaus ja vaihtojen kuningas
- Valmentajan potkut: välitön oma valinta ilman vaihtokiintiötä
- Veikkausosion automaattinen laskenta, kokonaistulokset ja gaalaesitys
- Varmistukset R2:een, muutoshistoria, pääylläpitäjä-rooli ja Tekninen ylläpito -sivu
- Sähköposti (Resend): viikkokatsaus, ylläpitoraportti, salasanan palautus
- Mobiilioptimointi

**Seuraavaksi**
- [ ] Vaihtopäivän muistutus- ja tulossähköpostit, ilmoitus valmentajan potkuista
- [ ] Sähköpostihälytys heti, jos tilastopäivitys epäonnistuu (nyt päiväraportissa)
- [ ] Pistekehityskäyrät
- [ ] Kausien hallinta
- [ ] GitHub Actions -julkaisu
- [ ] Oma domain (ks. [docs/domainin-vaihto.md](docs/domainin-vaihto.md))

**Myöhemmin**
- [ ] Workers AI -viikkokatsaukset
- [ ] Kuukausittainen varmistuksen palautustesti

---

*HogiGuru – tehty lätkäfaneilta lätkäfaneille.* 🏒
