# HogiGuru Play-Offs – suunnitelma

Play-Offs on runkosarjan rinnalla pyörivä **lisäkisa**: oma ilmoittautuminen, oma etusivu, oma leaderboard ja oma Hall of Fame -rivi. Ei osallistumismaksua eikä palkintoja – vain mainetta ja kunniaa.

## Päätetyt linjaukset

| Asia | Päätös |
|---|---|
| Rakenne | Alisivusto `/playoff/*` omalla etusivullaan; yläpalkissa **Play-Offs** (näkyvyys ylläpidosta) |
| Kentällinen | 3 H, 2 P, 1 MV – **ei valmentajia** |
| Valintatapa | Verkossa tehtävä lomakedraft: gurut täyttävät ennakkolistan, järjestelmä ajaa draftin kerralla (ei tilaisuutta) |
| Alku | Puolivälierät (8 joukkuetta). Säälipudotuspelit eivät kuulu kisaan |
| Pronssi | Ei pelata – välierien häviäjät putoavat |
| Vaihdot | 4 normaalia + rajattomasti ilmaisia vaihtoja pudonneiden joukkueiden pelaajille |
| Maksu/palkinnot | Ei |

## Aikajana

| Vaihe | Ajankohta | Sisältö |
|---|---|---|
| Ilmoittautuminen | runkosarjan viimeiset viikot | Erillinen lomake; runkosarjan gurut esitäytetään. Sisältää veikkaukset |
| Ennakkolista | säälipudotuspelien aikana (puolivälieräjoukkueet selvillä) | Paikkajärjestys + toivelistat 8 joukkueen pelaajista |
| Lomakedraft | ennen 1. puolivälieräottelua | Järjestelmä arpoo järjestyksen ja ajaa käärmedraftin ennakkolistoista; ylläpito tarkistaa ja julkaisee |
| Puolivälierät | | Pisteet playoff-tilastoista |
| Vaihtoikkuna 1 | kun kaikki 4 sarjaa ratkenneet | 4 joukkuetta putoaa |
| Välierät | | |
| Vaihtoikkuna 2 | kun molemmat sarjat ratkenneet | 2 joukkuetta putoaa |
| Finaali | | |
| Gaala | finaalin jälkeen | Veikkausosan paljastus, Hall of Fame |

## Vaihdot

- **Normaalit vaihdot: 4** koko playoffeille, käytettävissä missä tahansa ikkunassa kenelle tahansa.
- **Pudonneen joukkueen pelaaja: ilmainen vaihto**, ei kuluta normaaleja. Pudonnut pelaaja säilyttää keräämänsä pisteet.
- Ikkunat aukeavat **automaattisesti**, kun kierroksen viimeinen sarja on ratkennut (liiga.fi-otteludata), ja sulkeutuvat 2 h ennen seuraavan kierroksen ensimmäistä ottelua. Gurut saavat sähköpostin. Ylläpito voi säätää aikoja.
- Käsittely nykyisellä vaihtotoivejonolla (varavaihtoehdot, vuorojärjestys = draft-järjestys, joka toinen ikkuna käänteinen).
- **Valintarajat** (montako gurua voi omistaa saman pelaajan) koskevat **vain lomakedraftia**: lähtötaso H 8, P 8, MV 12 (nyrkkisääntö ≈ ¼ gureista, maalivahdeille enemmän; lukitaan kun ilmoittautuneiden määrä tiedossa, säädettävissä ylläpidosta). **Vaihdoissa ei rajoja** – pudonneen tilalle saa aina kenet tahansa elossa olevan, joten yksikään vaihto ei epäonnistu täyden pelaajan takia.
- Sääntö guruille yhdellä lauseella: *"Draftissa sama pelaaja voi olla enintään 8 gurulla (maalivahti 12), vaihdoissa rajoja ei ole."*

## Pisteytys

- Pelaajat: **samat kertoimet kuin runkosarjassa**, laskettuna playoff-tilastoista.
- Ei valmentajia.

## Veikkausosio

| Kohde | Pisteytys (ehdotus) |
|---|---|
| Puolivälierien voittajat (4) | voittaja oikein + bonus oikeasta otteluluvusta |
| Välierien voittajat (2) | kuten yllä, isommat pisteet |
| Mestari | iso pistemäärä |
| Pörssit: pisteet, maalit, syötöt, +/−, puolustajat, jäähyt, nollapelit | sama kaava kuin runkosarjassa |
| Playoffien MVP | bonus |

Hakemistopuuveikkaus täytetään ennen puolivälierien alkua (parit tiedossa säälipudotuspelien jälkeen).

## Näkymät (`/playoff`)

- **Etusivu:** hakemistopuu, sarjatilanteet, seuraavat ottelut, avoin vaihtoikkuna lähtölaskentoineen, kärkikolmikko.
- **Leaderboard:** pisteet + **"elossa"**-sarake (montako pelaajaa gurulla vielä mukana).
- **Hakemistopuu:** oikea puu + gurujen veikkausten osuvuus.
- **Oma joukkue:** pudonneet pelaajat harmaina, ilmaiset vaihdot korostettuina.
- **Vaihdot, Tilastot, Kokonaistulokset:** playoff-data.
- **Ylläpito:** kisavalitsin *Runkosarja / Play-Offs*; nykyiset ylläpitosivut toimivat valitun kisan tiedoilla.

## Tekninen toteutus

- Play-Offs = uusi rivi `seasons`-taulussa (`kind = 'playoffs'`, `parent_season_id`). Kaikki kausikohtainen (gurut, kentälliset, draft, vaihdot, ilmoittautuminen, pisteytys) toimii sellaisenaan.
- Kisan valinta pyynnössä (`/api/...?comp=playoffs` tai otsake); frontend `/playoff/*`-reitit asettavat sen.
- liiga.fi: playoff-turnauksen tilastot ja ottelut. Omat taulut tai `tournament`-sarake tilastoihin.
  - **Varmistettu:** `GET https://liiga.fi/api/v2/games?tournament=playoffs&season=2026` → `serie: "PLAYOFFS"`.
  - Jokaisessa ottelussa `playOffPhase`, `playOffPair` ja `playOffReqWins` → hakemistopuu ja sarjatilanne voidaan laskea suoraan otteluista.
  - Vaiheet (kausi 2026): 1 = 1. kierros (paras 5:stä), 2 = puolivälierät, 3 = välierät, 4 = pronssi (1 ottelu), 5 = finaali (paras 7:stä). Gurukisa alkaa vaiheesta 2; vaihe 4 ohitetaan.
  - Sarja ratkennut = jommankumman voitot ≥ `playOffReqWins` → tästä swap-ikkunan automaattinen avaus.
- Sarjatilanteet ja pudonneet joukkueet johdetaan otteluista.
- Uusi: vaihtoikkunoiden automaattinen avaus, ilmaisten vaihtojen kiintiölogiikka (laajennus nykyiseen `COUNTED_SWAP`-ehtoon), lomakedraftin ajo yhdellä napilla.

## Vaiheet

1. Kisatyyppi, kisavalitsin, liiga.fi playoff-data, hakemistopuu, `/playoff`-etusivu
2. Ilmoittautuminen + veikkaukset
3. Ennakkolista, lomakedraft, kentälliset, leaderboard
4. Automaattiset vaihtoikkunat + ilmaiset vaihdot
5. Kokonaistulokset, gaala, Hall of Fame

Playoffit alkavat maaliskuussa 2027; vaiheet 1–3 valmiiksi testattaviksi talven aikana.
