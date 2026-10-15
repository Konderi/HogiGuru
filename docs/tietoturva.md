# HogiGuru – Tietoturvakartoitus

**Päivitetty:** 15.10.2026 · **Kohde:** https://guru.konderi.fi (Cloudflare Worker + D1 + R2 + Resend)

Kartoitus kattaa sovelluskoodin, Cloudflare-konfiguraation, tunnistautumisen, tietosuojan ja ylläpitokäytännöt. Löydökset on luokiteltu: 🔴 korkea · 🟠 keskitaso · 🟡 matala · ✅ kunnossa.

---

## 1. Yhteenveto

| Alue | Tila |
|---|---|
| Salasanat ja istunnot | ✅ Vahva (PBKDF2, HttpOnly/Secure/SameSite-eväste, 256-bit istuntotunniste) |
| Brute force -suoja | ✅ Korjattu tässä kartoituksessa (yritysrajoitus) |
| CSRF | ✅ Korjattu (Origin-tarkistus + SameSite=Lax) |
| XSS | ✅ React escapoi; CSP lisätty; sähköpostit escapoitu |
| SQL-injektio | ✅ Kaikki käyttäjäsyötteet sidottuina parametreina |
| Oikeudet | ✅ Roolit tarkistetaan palvelimella (guru / ylläpitäjä / pääylläpitäjä) |
| Tietoturvaotsakkeet | ✅ Lisätty (CSP, HSTS, X-Frame-Options, nosniff, Referrer-, Permissions-Policy) |
| Virheilmoitukset | ✅ Korjattu – tekniset virheet eivät enää vuoda selaimelle |
| Riippuvuudet | ✅ `npm audit`: 0 haavoittuvuutta |
| Salaisuudet | ✅ Ei koodissa eikä git-historiassa; Resend-avain Cloudflare Secretinä |
| Varmistukset ja jäljitettävyys | ✅ Yöllinen + tapahtumavarmistus R2:een, muutoshistoria |
| Tietosuoja (GDPR) | 🟠 Tietosuojaseloste puuttuu (ks. 4.1) |
| Tilien 2-vaiheinen tunnistus | 🟠 Varmista palveluissa (ks. 4.2) |

---

## 2. Tässä kartoituksessa korjatut

| # | Löydös | Vakavuus | Korjaus |
|---|---|---|---|
| 1 | Kirjautumisessa ei ollut yritysrajoitusta → salasanojen arvailu mahdollista | 🔴 | Enintään 10 virheellistä yritystä / tunnus ja 30 / IP-osoite 15 minuutissa (`rate_limits`-taulu, migraatio 0010). Onnistunut kirjautuminen nollaa tunnuksen laskurin |
| 2 | Kirjautumisen vasteaika paljasti, onko sähköpostilla tunnus (PBKDF2 ajettiin vain olemassa oleville) | 🟡 | Tuntemattomalle tunnukselle lasketaan vertailuhash → sama vasteaika |
| 3 | Ei CSRF-suojaa muuta kuin SameSite=Lax. `*.konderi.fi`-alidomainit ovat "same-site", joten niiltä olisi voinut tehdä pyyntöjä kirjautuneen käyttäjän nimissä | 🟠 | Kaikki muuttavat API-pyynnöt hylätään (403), jos `Origin` ei ole sivuston oma |
| 4 | Kaikki palvelinvirheet palautettiin selaimelle sellaisenaan (esim. SQL-virheet, taulujen nimet) | 🟠 | Tekniset virheet → yleinen viesti + kirjaus Cloudflaren lokiin; omat suomenkieliset virheet näkyvät edelleen |
| 5 | Tietoturvaotsakkeet puuttuivat (clickjacking, MIME-sniffaus, ei CSP:tä) | 🟠 | `public/_headers`: CSP, HSTS 1 v, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP. API-vastauksiin nosniff/DENY ja `Cache-Control: no-store` henkilökohtaisille reiteille |
| 6 | Sivusto oli auki myös julkisessa `hogiguru.*.workers.dev`-osoitteessa | 🟡 | `workers_dev: false`, `preview_urls: false` – vain `guru.konderi.fi` |
| 7 | Salasanan palautuslinkin osoite muodostettiin pyynnön Host-otsakkeesta | 🟡 | Linkki muodostetaan aina kiinteästä osoitteesta (`SITE`) |
| 8 | Palautuspyyntöjä pystyi lähettämään rajattomasti eri osoitteisiin (sähköpostipommitus) | 🟡 | 10 pyyntöä / IP / tunti (lisäksi 3 / tunnus / tunti) |
| 9 | Ilmoittautumislomakkeen ainoa roskapostisuoja oli piilokenttä | 🟡 | 20 lähetystä / IP / tunti |
| 10 | Muutoshistoria peitti vain `password`-kentät | 🟡 | Peitetään myös `current`, `next`, `token` |
| 11 | Vanhentuneet rajoitus- ja palautusrivit jäivät kantaan | 🟡 | Siivotaan ajastetusti |

Varmennettu tuotannosta: otsakkeet palautuvat, vieraan originin POST → 403, workers.dev → 404.

---

## 3. Tarkistetut ja kunnossa olevat

### Tunnistautuminen
- Salasanat: PBKDF2-SHA256, 100 000 kierrosta, 16 tavun satunnainen suola, vakioaikainen vertailu. Vähimmäispituus 8.
- Istunto: 32 tavun satunnainen tunniste, eväste `HttpOnly; Secure; SameSite=Lax`, 30 vrk, palvelinpuolella mitätöitävissä (uloskirjautuminen poistaa rivin).
- Salasanan vaihto palautuslinkillä tai ylläpidon toimesta kirjaa ulos kaikilta laitteilta.
- Palautuslinkki: 256-bit, kertakäyttöinen, 60 min, kannassa vain SHA-256-tiiviste, vastaus ei paljasta tunnusten olemassaoloa.
- `/api/setup` toimii vain, kun kannassa ei ole yhtään käyttäjää.

### Oikeudet
- `requireUser`, `requireAdmin`, `requireSuper` -välikerrokset palvelimella; frontendin piilotukset ovat vain käytettävyyttä.
- Guru näkee vain oman kentällisensä (`/me/*` käyttää aina istunnon käyttäjää, ei parametria).
- Vain pääylläpitäjä voi nimetä/muokata pääylläpitäjää; omaa roolia ei voi poistaa tai tunnusta passivoida.
- Kokonaistulosten veikkausosa palautetaan julkisesti vasta julkaisun jälkeen.
- Julkiset rajapinnat (Gurukierros, tilastot) eivät paljasta gurujen kentällisiä – vain varausmäärät.

### Syötteet
- Kaikki SQL-kyselyt käyttävät sidottuja parametreja; ainoat merkkijonoon upotetut osat ovat koodin vakioita (pelipaikkasuodattimet, roolilauseke).
- React escapoi kaiken tulostettavan; `dangerouslySetInnerHTML` ei ole käytössä.
- Sähköpostipohjissa käyttäjän tiedot kulkevat `esc()`-funktion läpi.

### Infrastruktuuri
- HTTPS pakotettu (Cloudflare + HSTS).
- Salaisuudet: `RESEND_API_KEY` Cloudflare Secretinä; `wrangler.jsonc`:ssä ei salaisuuksia; git-historia tarkistettu.
- `data/` (Excelit, henkilötiedot) ei ole versionhallinnassa.
- Varmistukset R2:ssa (yksityinen säilö, ladattavissa vain pääylläpitäjän istunnolla); D1 Time Travel 30 pv.
- Muutoshistoria (`audit_log`) kaikista ylläpidon ja gurujen muuttavista pyynnöistä.

---

## 4. Avoimet suositukset

### 4.1 🟠 Tietosuoja (GDPR)
Ilmoittautumisessa kerätään nimi, sähköposti ja puhelinnumero. Kaveriporukan toiminta voi kuulua kotitalouspoikkeuksen piiriin, mutta julkinen verkkolomake kannattaa varustaa kevyellä selosteella:
- [ ] Lyhyt **tietosuojaseloste** (rekisterinpitäjä, mitä kerätään, mihin käytetään, säilytysaika, kenelle näkyy, oikeus poistoon) – linkki lomakkeeseen ja alatunnisteeseen.
- [ ] **Säilytysaika:** poista tai anonymisoi edellisten kausien puhelinnumerot ja hylätyt ilmoittautumiset kauden päätyttyä (Hall of Fame säilyttää vain nimet).
- [ ] Varmistuksissa on henkilötietoja → ne poistuvat automaattisesti 30/90 pv kuluttua; pysyvät kuukausivarmistukset kannattaa siivota vuosittain.
- [ ] Alikäsittelijät: Cloudflare (EU-tietokanta EEUR), Resend (EU-alue eu-west-1).

### 4.2 🟠 Ylläpitotilien suojaus (ei koodimuutos)
- [ ] **Kaksivaiheinen tunnistus** päälle: Cloudflare, GitHub (Konderi), Resend, domain-rekisteröijä ja sähköposti, johon palautusviestit tulevat.
- [ ] Cloudflare API -tokenit mahdollisimman suppeilla oikeuksilla; vanhat tokenit pois.
- [ ] GitHub: haara `main` suojatuksi (ei force pushia), Dependabot-hälytykset päälle.

### 4.3 🟡 Sovellus
| Suositus | Perustelu |
|---|---|
| 2-vaiheinen tunnistus ylläpitäjille (TOTP) | Ylläpitotunnuksella voi muuttaa kaikkien pisteitä; nyt suojana vahva salasana + yritysrajoitus |
| Ilmoitus sähköpostiin, kun salasana vaihdetaan | Käyttäjä huomaa luvattoman vaihdon |
| Istuntotunnisteet kantaan tiivisteenä | Kantavuoto ei silloin mahdollistaisi istuntojen kaappausta (vaikutus pieni, kanta ei ole julkinen) |
| `style-src 'unsafe-inline'` pois CSP:stä | Vaatii inline-tyylien poiston (kaukalon sijoittelu); XSS-riski on jo pieni ilman sitä |
| Google Fonts omalle palvelimelle | Poistaa kolmannen osapuolen pyynnöt (tietosuoja) ja yksinkertaistaa CSP:tä |
| Cloudflare Turnstile ilmoittautumislomakkeeseen | Jos roskapostia alkaa tulla |
| Vahvemmat salasanavaatimukset (esim. 10 merkkiä, vuotaneiden salasanojen tarkistus) | Nykyinen 8 merkkiä + yritysrajoitus riittää kaveriporukalle |

### 4.4 🟡 Cloudflare-asetukset (hallintapaneeli, zone konderi.fi)
- [ ] SSL/TLS → tila **Full (strict)**, *Always Use HTTPS* päälle, *Minimum TLS* 1.2.
- [ ] Security → *Bot Fight Mode* päälle.
- [ ] Valinnainen: WAF-rajoitussääntö `/api/auth/*` (esim. 20 pyyntöä / min / IP) – toimii jo ennen Workeria.

---

## 5. Säännöllinen tarkistus

| Milloin | Tehtävä |
|---|---|
| Joka aamu (automaattinen) | Ylläpitoraportti: varmistus ja tilastopäivitys onnistuneet |
| Kuukausittain | `npm audit` ja riippuvuuksien päivitys; vilkaisu muutoshistoriaan |
| Kauden alussa | Käyttäjälistan läpikäynti: passivoi poistuneet, tarkista ylläpitäjät |
| Kauden lopussa | Henkilötietojen siivous (4.1), kokeile varmistuksen palautus testikantaan |
| Muutosten jälkeen | Päivitä tämä dokumentti |
