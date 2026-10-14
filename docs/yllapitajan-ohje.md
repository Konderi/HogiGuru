# HogiGuru – Ylläpitäjän ohje

Ylläpito löytyy osoitteesta **/admin** (vaatii admin-roolin). Gurujen ohje: [kayttoohje.md](kayttoohje.md).

---

## 0. Ensimmäinen käyttöönotto

1. Julkaise sivusto (ks. README → *Julkaisu Cloudflareen*) ja aja `npm run db:migrate:remote`.
2. Avaa `/kirjaudu`. Kun kannassa ei ole käyttäjiä, sivu tarjoaa ensimmäisen ylläpitäjän luonnin.
3. **Yleiskatsaus → Päivitä tilastot** hakee pelaajat, tilastot ja sarjataulukon liiga.fi:stä.

---

## 1. Ennen kautta

### 1.1 Säännöt ja pisteytys
**Pisteytys & kausi:**
- Kentällisen koko (V/MV/P/H).
- Valintarajat paikoittain, eli kuinka monella gurulla sama pelaaja voi olla.
- Vaihtojen määrä.
- Kertoimet.
- Veikkausosion pisteet.

👉 **Lukitse kertoimet ennen kauden alkua** (ks. kohta 6).

### 1.2 Vaihtopäivät
**Vaihdot → Vaihtopäivät:** lisää päivät ja kellonajat (oletus 9–21).

### 1.3 Ilmoittautuminen
1. **Ilmoittautuminen:** aseta määräaika, maksu ja lisätieto. Paina **▶ Avaa ilmoittautuminen**.
2. Etusivulle tulee banneri. Lomake sulkeutuu automaattisesti määräajan jälkeen tai napista.
3. Avaa ilmoittautunut nähdäksesi veikkaukset.
4. **Hyväksy** → guru luodaan. Rastita *luo tunnus* ja anna alkusalasana, ja välitä se gurulle.
5. **Hylkää** esim. tuplailmoittautumiset.
6. **CSV** vie listan esim. maksujen seurantaan.

### 1.4 Käyttäjät ja gurut
- **Käyttäjät:** luo ja muokkaa tunnuksia, vaihda salasanoja, liitä tunnus guruun, anna admin-rooli.
- **Gurut & kentälliset:** nimet ja draft-numerot.

### 1.5 Valmentajat
**Valmentajat:** lisää jokaisen joukkueen päävalmentaja.

---

## 2. Draft

1. **Draft → Listat:** kokoa draft-listat paikoittain.
2. Merkitse etäosallistujat. He täyttävät ennakkolistan (*Oma joukkue → Draft-ennakkolista*), tai syötä se heidän puolestaan.
3. 🎲 **Arvo järjestys** (käärmedraft valinnainen).
4. Draft-iltana **▶ Aloita** ja avaa `/draft` isolle näytölle.
5. Vuorossa olevalle: valitse pelaaja. Etäosallistujalle ⚙ **valinta ennakkolistalta**. Virheen voi perua ↶.
6. Lopuksi **✓ Vie kentällisiin**. Draftin tila muuttuu `done` ja gurut näkevät joukkueensa.

Järjestelmä estää täynnä olevat pelaajat, tuplavalinnat ja paikkojen ylityksen.

---

## 3. Vaihtopäivä

1. Gurut tallentavat toiveensa vaihtopäivän aikana (klo 21 asti).
2. Päivän päätyttyä: **Vaihdot → kyseinen päivä → Toiveet**.
3. **Esikatselu** näyttää jokaisen toiveen tuloksen ja syyn (✓ onnistuu / varavaihtoehto käytetty / ✗ täynnä / kiintiö täynnä). Vuorojärjestys (normaali/käänteinen) näkyy otsikossa.
4. Tarkista esikatselu. Paina **Hyväksy ja toteuta**. Vaihdot kirjataan ja päivä merkitään käsitellyksi (✓ Käsitelty).
5. Ilmoita tulokset WhatsApp-ryhmään (esikatselun voi kopioida).

**Yksittäinen vaihto käsin:** Gurut → ⇄ Vaihda (esim. valmentajan potkut).
**Virheellinen vaihto:** Vaihdot → vaihtoloki → ↶ Peru.

---

## 4. Valmentajan potkut

1. **Valmentajat → Potkut** valmentajan kohdalla → kaikki gurut, joilla hän on, saavat −10 p automaattisesti.
2. Lisää joukkueen uusi valmentaja.
3. Jos guru haluaa vaihtaa, tee vaihto käsin (Gurut → ⇄ Vaihda). Se ei kuluta normaalia vaihtokiintiötä vain, jos HG-komitea niin päättää; säädä tarvittaessa korjauksella.

---

## 5. Kauden aikana

- **Tilastot päivittyvät automaattisesti** klo 17.00–23.00 puolen tunnin välein ja sen jälkeen 6 tunnin välein (klo 05 ja 11). **Yleiskatsaus → Päivitysloki** näyttää onnistumiset. **Päivitä tilastot** -nappi pakottaa päivityksen.
- **Pistekorjaukset:** Gurut → guru → Korjaus (+/− pisteet ja selite). Näkyy gurulle.
- **Kentällisen korjaus:** Gurut → paikan muokkaus (esim. väärä pelaaja tai päivämäärä).

---

## 6. ⚠️ Pistekertoimien muuttaminen kesken kauden

HG-pisteet lasketaan **aina lennossa**: pelaajan koko kauden tilastot × **nykyiset** kertoimet. Siksi muutos vaikuttaa **takautuvasti** eli koko kauteen, myös jo pelattuihin peleihin.

**Peruminen:** muutoksen saa perutuksi palauttamalla vanhat kertoimet, jolloin pisteet palaavat täsmälleen ennalleen. Poikkeuksena ovat muutettujen kertoimien aikana käsitellyt vaihdot (niiden pisteet on jäädytetty uusilla kertoimilla) ja leaderboardin päiväkohtainen historia.

Vaikutukset tarkemmin:

| Mikä | Mitä tapahtuu |
|---|---|
| Aktiiviset paikat (alusta asti kentällisessä) | Koko kauden pisteet lasketaan uusilla kertoimilla, myös jo pelatut ottelut |
| Tilastot-sivu, leaderboard | Muuttuvat heti uusien kertoimien mukaisiksi |
| Vaihdossa **poistuneet** pelaajat | Pisteet on jäädytetty vaihtohetkellä vanhoilla kertoimilla, **eivät muutu** |
| Vaihdossa **tulleet** pelaajat | Alkupisteet on tallennettu vanhoilla kertoimilla, mutta nykyiset lasketaan uusilla. Erotus voi vääristyä (jopa negatiiviseksi) |
| Pistekorjaukset, potkut | Eivät muutu |
| Leaderboardin historia (sijoitusmuutokset) | Vanhat päiväkohtaiset sijat jäävät ennalleen, mikä voi tuottaa yhden kerran isoja ▲▼-hyppyjä |

**Suositus:** älä muuta kertoimia kauden alettua. Jos sääntömuutos on pakko tehdä (HG-komitean päätös):
1. Ota varmuuskopio (`npx wrangler d1 export hogiguru --remote --output backup.sql`).
2. Muuta kertoimet.
3. Tarkista vaihdossa tulleiden pelaajien pisteet *Gurut*-näkymästä ja korjaa vääristymät tarvittaessa pistekorjauksilla.
4. Tiedota gurut.

Kentällisen koon, valintarajojen ja vaihtojen määrän muutos koskee vain tulevia valintoja ja vaihtoja.

---

## 7. Kauden lopussa

1. Varmista viimeinen tilastopäivitys runkosarjan päätyttyä.
2. Laske veikkausosion pisteet ja lisää ne pistekorjauksina (automaattinen laskenta tiekartalla).
3. **Hall of Fame:** lisää kauden mitalistit.
4. Ota varmuuskopio.
5. Uusi kausi: Pisteytys & kausi → uusi kausi, ja aloita kohdasta 1.

---

## 8. Ongelmatilanteet

| Ongelma | Ratkaisu |
|---|---|
| Tilastot eivät päivity | Katso päivitysloki. liiga.fi:n rajapinta on epävirallinen; muutos korjataan tiedostoon `worker/liiga.ts` |
| Pelaajaa ei löydy haussa | Päivitä tilastot (uudet pelaajat tulevat liiga.fi:stä) |
| Guru ei pääse sisään | Käyttäjät → aseta uusi salasana; tarkista liitos guruun |
| Väärä vaihto toteutui | Vaihtoloki → ↶ Peru, tee oikea vaihto käsin |
| Kanta pitää palauttaa | D1 Time Travel (30 pv) tai varmuuskopio |

## Gaalaesitys

**Kokonaistulokset**-sivulla (tai Ylläpito → Kokonaistulokset) ylläpitäjä näkee napin **🎬 Gaalaesitys**. Se avaa koko näytön esityksen, joka paljastaa tulokset vaiheittain rauhallisella esiintulolla:

1. Sijat 31– (huonoimmasta alkaen, yksi kerrallaan nopeahkosti)
2. Sijat 21–30
3. Sijat 11–20
4. Sijat 10, 9, … 2 yksi kerrallaan – sijoista 3 ja 2 alkaen palkintokoroke (2. vasemmalla, 1. keskellä, 3. oikealla)
5. Voittaja – kultainen konfettisade ja ilotulitus n. 10 s

Ohjaus: **välilyönti / → / Enter** = seuraava, **←** = takaisin, **Esc** = sulje, **↺ Alusta** = alkuun, **⛶** = koko näyttö.

**Harjoittelu:** esitys toimii myös ennen julkaisua (merkintä "harjoitus") eikä paljasta mitään muille. Viimeisen vaiheen jälkeen napista **📣 Julkaise tulokset kaikille** tulokset aukeavat julkiselle sivulle.

## Ilmoittautuneen liittäminen aiempaan guruun

Hyväksyttäessä järjestelmä vertaa nimeä kaikkiin aiempiin guruihin (Hall of Fame + aiemmat kaudet):

- **Sama nimi** (kirjainkoosta ja ääkkösistä riippumatta) → liitetään automaattisesti, ja nimi kirjoitetaan aiemmassa muodossa, jolloin Hall of Fame -tilastot jatkuvat samalla rivillä.
- **Samankaltaisia nimiä** (kirjoitusvirhe, sama sukunimi + etukirjain, lyhenne) → ikkuna listaa ne; valitse oikea, jos kyseessä on sama henkilö.
- **Ei osumaa** → luodaan uusi guru lomakkeen nimellä.

Jos ilmoittautumisen sähköpostilla on jo käyttäjätunnus, guru liitetään siihen automaattisesti (salasanaa ei tarvitse antaa).
