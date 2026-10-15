# HogiGuru – Ylläpitäjän ohje

Ylläpito löytyy osoitteesta **/admin**. Gurujen ohje: [kayttoohje.md](kayttoohje.md).

| Rooli | Pääsy |
|---|---|
| **Ylläpitäjä** | Pelin hallinta: kaikki ylläpidon osiot paitsi Tekninen ylläpito |
| **Pääylläpitäjä** | Lisäksi **Tekninen ylläpito** (varmistukset, sähköposti, muutoshistoria, järjestelmän tila) ja oikeus nimetä muita pääylläpitäjiä. Saa joka aamu ylläpitoraportin sähköpostiin |

---

## 0. Ensimmäinen käyttöönotto

1. Julkaise sivusto (ks. README → *Julkaisu Cloudflareen*): D1, R2-säilö, `RESEND_API_KEY` ja `npm run db:migrate:remote`.
2. Avaa `/kirjaudu`. Kun kannassa ei ole käyttäjiä, sivu tarjoaa ensimmäisen käyttäjän luonnin; hänestä tulee pääylläpitäjä.
3. **Yleiskatsaus → Päivitä tilastot** hakee pelaajat, tilastot ja sarjataulukon liiga.fi:stä.
4. **Tekninen ylläpito → Sähköposti → Testiviesti itselle** varmistaa, että sähköposti toimii.

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
- **Käyttäjät:** luo ja muokkaa tunnuksia, vaihda salasanoja, liitä tunnus guruun, anna rooli (Guru / Ylläpitäjä / Pääylläpitäjä). Vain pääylläpitäjä voi nimetä tai muokata pääylläpitäjää; omaa rooliasi et voi vahingossa poistaa.
- Gurut voivat palauttaa unohtuneen salasanan itse sähköpostilla (*Kirjaudu → Unohtuiko salasana?*). Käsin asetus on varakeino.
- **Gurut & kentälliset:** nimet ja draft-numerot.

### 1.5 Valmentajat
**Valmentajat:** lisää jokaisen joukkueen päävalmentaja.

---

## 2. Draft

1. **Draft → Listat:** kokoa draft-listat paikoittain. Ota käärmedraft käyttöön kohdassa *Pisteytys & kausi* (joka toinen kierros käänteisesti).
2. Ennen tilaisuutta jokaisen gurun on täytettävä draft-lomake (*Oma joukkue*). Lomake on pakollinen niille, jotka eivät ole paikalla.
3. Avaa **📺 Seinänäkymä** (`/draft/naytto`) seinälle ja Teamsiin (⛶ = koko näyttö). Pidä hallinta omalla koneellasi tai puhelimella. Seinänäkymä vaihtaa sisältöä itse draftin tilan mukaan (aula → arvonta → järjestys → live → valmis), joten sitä ei tarvitse vaihdella kesken tilaisuuden. Painike näkyy, kun draft on valmistelussa tai käynnissä.
4. **Vaihe 1 – läsnäolo:** merkitse *Ketkä ovat paikalla?* -kortissa paikalla olevat gurut. Poissaolevalta, jolta lomake puuttuu, näkyy ⚠. Draftia ei voi aloittaa, ennen kuin kaikilla poissaolevilla on lomake.
5. **Vaihe 2 – 🎲 Arvo järjestys:** 10 s lähtölaskennan jälkeen gurut nousevat seinälle satunnaisessa järjestyksessä 10 s välein, ja draft-numero paljastuu 4 s kohdalla. Arvonnan voi tauottaa (⏸). Numerot ja järjestys pysyvät salassa myös palvelimella ja draft-taulussa, kunnes ne paljastetaan. Arvonnan jälkeen seinälle jää valintajärjestys – käy se läpi rauhassa.
6. **Vaihe 3 – ▶ Aloita draft** (ei käynnisty automaattisesti arvonnan jälkeen). Paikalla oleva guru kertoo vuorollaan valintansa (vapaasti mikä tahansa paikka/pelaaja), ja ylläpitäjä klikkaa sen. Poissaolevalle ⚙ **Valitse ennakkolistalta**. Virheen voi perua ↶.
7. **Seinänäkymä draftin aikana:**
   - **Vasemmalla 🔥 varaustilanne** sarakkeittain (valmentajat, maalivahdit, puolustajat, hyökkääjät): kaikki vähintään kerran varatut, eniten varatut ylimpänä. Keltainen = kuuma (≥ 3), punainen = täynnä. Sarakkeet vierivät.
   - Sen alla **draft-taulu**, joka vierii itsestään vuorossa olevan gurun kohdalle.
   - **Oikealla** vuorossa oleva guru, hänen vapaat paikkansa, kierros (↩ = käänteinen kierros) ja seuraavat vuorot; alla viimeisimmät valinnat.
   - Uusi valinta välähtää koko ruudulle.
8. **Vaihe 4 – Tarkista ja hyväksy:** kun kaikki valinnat on tehty, seinällä lukee *Draft valmis*, mutta joukkueet **eivät vielä näy guruille**. Hallintaan aukeaa tarkistuskortti, jossa jokaisen gurun valinnat näkyvät. Virheellisen valinnan voi korjata klikkaamalla sitä ja valitsemalla tilalle toisen saman pelipaikan nimen (samat säännöt kuin draftissa).
9. **✓ Hyväksy ja julkaise joukkueet:** järjestelmä ottaa automaattisen varmistuksen, vie valinnat kentällisiin ja lukitsee draftin (`done`). Joukkueet näkyvät guruille *Oma joukkue* -sivulla. Tämän jälkeen muutokset tehdään vaihtoina tai *Gurut & kentälliset* -sivulla.

Järjestelmä estää täynnä olevat pelaajat, tuplavalinnat ja paikkojen ylityksen.

**Draft yläpalkissa:** *Näytä yläpalkissa* -ruksi (Draft-sivun yläosassa) näyttää tai piilottaa Draft-linkin kaikkien käyttäjien yläpalkista. Oletuksena päällä; piilota kauden alettua. Sivu toimii edelleen suoralla osoitteella `/draft`.

**Harjoittelu ennen tilaisuutta** (mitään ei tallenneta): paina **▶ Aloita draft** -painiketta, jossa on keltainen **HARJOITUS**-merkki (`/admin/draft/harjoitus`). Harjoitus kulkee samat vaiheet kuin oikea draft:
1. **Läsnäolo:** 👥 *10 testigurua* (keksityt nimet, 3 lomakkeella) tai *Oikeat gurut*. 🎟 *Generoi testikupongit* tekee kaikille keksityt lomakkeet (paina gurujen valinnan jälkeen). Läsnäolon voi vaihtaa klikkaamalla.
2. **🎲 Aloita arvonta:** seinänäkymässä arvonta (harjoituksessa 5 s per guru). Numerot ilmestyvät draft-tauluun vasta arvonnan edetessä.
3. **Järjestys** → **▶ Aloita draft**.
4. **Draft:** valinnat haulla (näytetään 6 osumaa, *Kaikki* tai pelipaikka). Lomakkeelta valitsevien vuoro tehdään automaattisesti 3 s kuluttua. Käärmedraft on harjoituksessa aina päällä. Tauko, ↶ peru, ↺ nollaa.
5. **Tarkistus:** valintojen korjaus kuten oikeassa draftissa.
6. **Julkaisu:** näyttää jokaisen gurun joukkueen pelipaikoittain.

Avaa **📺 seinänäkymä samassa selaimessa** (`/draft/naytto?harjoitus`): se seuraa hallintaikkunaa reaaliajassa, ja sen painikkeet (arvonnan aloitus, tauko) ohjaavat harjoitusta. Jos draft-listaa ei ole koottu, harjoituksessa voi valita kaikista Liigan pelaajista ja valmentajista.

---

## 3. Vaihtopäivä

1. Gurut tallentavat toiveensa vaihtopäivän aikana (klo 21 asti).
2. Päivän päätyttyä: **Vaihdot → kyseinen päivä → Toiveet**.
3. **Esikatselu** näyttää jokaisen toiveen tuloksen ja syyn (✓ onnistuu / varavaihtoehto käytetty / ✗ täynnä / kiintiö täynnä). Vuorojärjestys (normaali/käänteinen) näkyy otsikossa.
4. Tarkista esikatselu. Paina **Hyväksy ja toteuta**. Järjestelmä ottaa ensin automaattisesti varmistuksen, kirjaa vaihdot ja merkitsee päivän käsitellyksi (✓ Käsitelty).
5. Ilmoita tulokset WhatsApp-ryhmään (esikatselun voi kopioida). Gurut näkevät vaihtojen vaikutuksen myöhemmin myös *Gurukierros → Vaihtojen kuningas* -näkymästä.

**Yksittäinen vaihto käsin:** Gurut → ⇄ Vaihda.
**Virheellinen vaihto:** Vaihdot → vaihtoloki → ↶ Peru.

---

## 4. Valmentajan potkut

1. **Valmentajat → Potkut** valmentajan kohdalla → kaikki gurut, joilla hän on, saavat −10 p automaattisesti.
2. Lisää joukkueen uusi valmentaja (**Valmentajat → Lisää valmentaja**).
3. Gurujen *Oma joukkue* -sivulle ilmestyy valintalaatikko, josta he valitsevat uuden valmentajan **heti itse**. Valinta ei vaadi vaihtopäivää eikä kuluta vaihtokiintiötä, ja uusi valmentaja kerää pisteitä valintapäivästä alkaen. Ilmoita potkuista WhatsApp-ryhmään.
4. Jos guru ei vaihda, joukkueen uusi valmentaja jatkaa pisteiden keräämistä hänen kentällisessään.

Pelaajille ei ole vastaavaa poikkeusta: Liigasta lähtenyt pelaaja vaihdetaan normaalisti seuraavana vaihtopäivänä.

---

## 5. Kauden aikana

- **Tilastot päivittyvät automaattisesti** klo 17.00–23.00 puolen tunnin välein ja sen jälkeen klo 05 ja 11; muulloin täydennetään ottelukohtaista lokia. **Yleiskatsaus → Päivitysloki** näyttää onnistumiset. **Päivitä tilastot** -nappi pakottaa päivityksen.
- **Sähköpostit lähtevät itsestään:** viikkokatsaus guruille maanantaisin klo 9, ylläpitoraportti pääylläpitäjille joka aamu klo 7. Raportista näet heti, epäonnistuiko yön varmistus tai tilastopäivitys.
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
1. Ota varmistus (*Tekninen ylläpito → Varmistukset → Tee varmistus nyt*).
2. Muuta kertoimet.
3. Tarkista vaihdossa tulleiden pelaajien pisteet *Gurut*-näkymästä ja korjaa vääristymät tarvittaessa pistekorjauksilla.
4. Tiedota gurut.

Kentällisen koon, valintarajojen ja vaihtojen määrän muutos koskee vain tulevia valintoja ja vaihtoja.

---

## 7. Kauden lopussa

1. Varmista viimeinen tilastopäivitys runkosarjan päätyttyä.
2. **Kokonaistulokset:** veikkausosion pisteet lasketaan automaattisesti. Tarkista esikatselu ja korjaa tarvittaessa oikeat vastaukset (esim. tasapelit pörsseissä).
3. Gaalassa **🎬 Gaalaesitys** ja lopuksi **📣 Julkaise tulokset kaikille** (ks. *Gaalaesitys* alla).
4. **Tallenna Hall of Fameen** Kokonaistulokset-sivulta.
5. Ota varmistus (*Tee varmistus nyt*).
6. Uusi kausi: Pisteytys & kausi → uusi kausi, ja aloita kohdasta 1.

---

## 8. Tekninen ylläpito (pääylläpitäjä)

**Ylläpito → Tekninen ylläpito**, neljä välilehteä:

| Välilehti | Sisältö |
|---|---|
| **Järjestelmän tila** | Viimeisin varmistus (keltainen, jos yli 26 h vanha), sähköpostin tila, viestit ja muutokset 7 pv, käyttäjät rooleittain, tilastopäivitysten loki |
| **Varmistukset** | Kaikki R2-varmistukset, lataus (.sql), *Tee varmistus nyt* |
| **Sähköposti** | Testiviesti itselle, viikkokatsaus itselle / kaikille, ylläpitoraportti, lähetysloki virheineen |
| **Muutoshistoria** | Kuka teki mitä ja milloin (300 viimeisintä), suodatus |

**Varmistukset:** yöllinen klo 03 (30 pv, kuun 1. pysyvästi), automaattinen ennen vaihtopäivän käsittelyä ja draftin vientiä (90 pv) sekä käsin otetut. Palautusohje: README → *Varmistukset, sähköposti ja muutoshistoria*.

**Viikkokatsaus kaikille** -nappi lähettää vain niille, jotka eivät ole jo saaneet kyseisen viikon katsausta, joten tuplalähetyksiä ei synny.

---

## 9. Ongelmatilanteet

| Ongelma | Ratkaisu |
|---|---|
| Tilastot eivät päivity | Katso päivitysloki. liiga.fi:n rajapinta on epävirallinen; muutos korjataan tiedostoon `worker/liiga.ts` |
| Pelaajaa ei löydy haussa | Päivitä tilastot (uudet pelaajat tulevat liiga.fi:stä) |
| Guru ei pääse sisään | Ohjaa *Unohtuiko salasana?* -toimintoon. Varakeino: Käyttäjät → aseta uusi salasana; tarkista liitos guruun |
| Palautusviesti ei tule perille | Tekninen ylläpito → Sähköposti → lähetysloki (virheen syy). Pyydä katsomaan roskaposti |
| Sähköpostit eivät lähde | Järjestelmän tila → Sähköposti. Tarkista `RESEND_API_KEY` Cloudflaressa ja Resendissä domainin `konderi.fi` tila (*Verified*) |
| Väärä vaihto toteutui | Vaihtoloki → ↶ Peru, tee oikea vaihto käsin |
| Joku muutti jotain väärin | Tekninen ylläpito → Muutoshistoria näyttää kuka, mitä ja milloin |
| Kanta pitää palauttaa | Tekninen ylläpito → Varmistukset (lataa .sql) tai D1 Time Travel (30 pv); ks. README |
| Sivuston osoite vaihtuu | [domainin-vaihto.md](domainin-vaihto.md) |

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
