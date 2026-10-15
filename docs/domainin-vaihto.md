# Domainin vaihto

Ohje HogiGurun siirtämiseen osoitteesta `guru.konderi.fi` omaan domainiin (esimerkeissä `hogiguru.fi`).

> **Periaate:** uusi domain otetaan käyttöön *rinnalle*, vanha jätetään ohjaamaan uuteen vähintään kauden loppuun. Mitään dataa ei siirretä – Worker, D1-kanta, R2-varmistukset ja salaisuudet pysyvät ennallaan.

---

## 1. Valmistelu

- [ ] **Osta domain** (esim. `hogiguru.fi`). Helpointa on rekisteröidä se Cloudflare Registrarissa tai siirtää nimipalvelimet Cloudflareen (Websites → *Add a site* → vaihda rekisteröijällä nimipalvelimiksi Cloudflaren antamat). Workerin custom domain vaatii, että zone on **samassa Cloudflare-tilissä**.
- [ ] Päätä pääosoite: `hogiguru.fi` vai `www.hogiguru.fi`. Suositus: paljas `hogiguru.fi` pääosoitteeksi, `www` ohjataan siihen.
- [ ] Päätä sähköpostin lähettäjä: jatketaanko `no-reply@konderi.fi`:llä vai vaihdetaanko `no-reply@hogiguru.fi`:hin (ks. kohta 4).
- [ ] Tee käsin varmistus: *Ylläpito → Tekninen ylläpito → Varmistukset → Tee varmistus nyt*.
- [ ] Valitse ajankohta, jolloin ei ole vaihtopäivää tai draftia käynnissä.

## 2. Cloudflare: uusi domain Workeriin

Muokkaa `wrangler.jsonc`:

```jsonc
"routes": [
  { "pattern": "hogiguru.fi", "custom_domain": true },
  { "pattern": "www.hogiguru.fi", "custom_domain": true },
  { "pattern": "guru.konderi.fi", "custom_domain": true }   // vanha jää toistaiseksi
],
```

```sh
npm run deploy
```

Cloudflare luo DNS-tietueet ja SSL-sertifikaatin automaattisesti (muutama minuutti). Tarkista: *Workers & Pages → hogiguru → Settings → Domains & Routes*.

**API-tokenin oikeudet:** jos julkaisu tehdään tokenilla (CI), lisää tokenille uuden zonen oikeudet *Workers Routes · Edit* ja *DNS · Edit*.

## 3. Koodissa olevat osoitteet

Nämä kohdat sisältävät osoitteen kovakoodattuna ja pitää päivittää:

| Tiedosto | Mitä | Vaikutus |
|---|---|---|
| `worker/mail.ts` | `SITE = 'https://guru.konderi.fi'` ja alatunnisteen linkkiteksti | Sähköpostien linkit ja peruutuslinkit |
| `worker/index.ts` | Peruutussivun linkkiteksti (`/unsubscribe`) | Ulkoasu |
| `worker/index.ts`, `worker/liiga.ts` | `User-Agent: HogiGuru/1.0 (+https://guru.konderi.fi)` | Tunniste liiga.fi-hauissa |
| `src/admin/Users.tsx` | Kirjautumisosoite uuden käyttäjän ohjeessa | Ylläpidon näkymä |
| `wrangler.jsonc` | `routes`, `MAIL_FROM` | Domain ja lähettäjä |
| `README.md`, `docs/*.md` | Tuotanto-osoite, arkkitehtuurikuva | Dokumentaatio |

Tarkista ettei mitään jäänyt:

```sh
grep -rn "konderi" --exclude-dir={node_modules,.git,dist,.wrangler,data} .
```

> Vinkki: `SITE` kannattaa siirtää `wrangler.jsonc`:n `vars`-osioon (`SITE_URL`), jolloin seuraava vaihto on yhden rivin muutos.

Frontend käyttää suhteellisia polkuja (`/api/...`), joten se toimii kaikilla domaineilla ilman muutoksia.

## 4. Sähköposti (Resend)

**Vaihtoehto A – lähettäjä pysyy `no-reply@konderi.fi`:** ei toimenpiteitä. Vain viestien linkit päivittyvät kohdan 3 muutoksella.

**Vaihtoehto B – lähettäjäksi `no-reply@hogiguru.fi`:**
- [ ] Resend → *Domains → Add domain* → `hogiguru.fi`.
- [ ] Lisää Resendin antamat tietueet Cloudflaren DNS:ään (*DNS only*, harmaa pilvi): DKIM-TXT (`resend._domainkey`), SPF/palautus-tietueet (`send`/MX/TXT) ja suositeltu `_dmarc` TXT `v=DMARC1; p=none;`.
- [ ] Odota tila **Verified**.
- [ ] Päivitä `wrangler.jsonc`: `"MAIL_FROM": "HogiGuru <no-reply@hogiguru.fi>"` ja `DEFAULT_FROM` tiedostossa `worker/mail.ts`.
- [ ] Deploy ja *Testiviesti itselle*.
- [ ] Uusi domain ilman lähetyshistoriaa voi aluksi päätyä roskapostiin – tee vaihto mieluiten keskellä viikkoa, ei juuri ennen maanantain viikkokatsausta.

`RESEND_API_KEY` ei muutu (sama Resend-tili).

## 5. Vanhan osoitteen uudelleenohjaus

Kun uusi osoite toimii, ohjataan vanha pysyvästi (301), jotta kirjanmerkit, vanhat sähköpostilinkit ja hakukoneet löytävät perille.

Helpoin tapa – Cloudflare **Redirect Rule** zonelle `konderi.fi`:
- *Rules → Redirect Rules → Create*
- Ehto: `Hostname equals guru.konderi.fi`
- Toiminto: *Dynamic*, `concat("https://hogiguru.fi", http.request.uri.path)`, tila **301**, *Preserve query string* päälle
- Poista samalla `guru.konderi.fi` Workerin `routes`-listasta ja tee deploy. Jätä DNS-tietue (proxattuna, oranssi pilvi) paikalleen, jotta sääntö voi toimia – esim. `AAAA guru 100::`.

Sama tehdään `www.hogiguru.fi` → `hogiguru.fi`, jos www jätettiin vain ohjaukseksi.

> **Huom. peruutuslinkit:** jo lähetetyissä viesteissä on linkki `https://guru.konderi.fi/api/unsubscribe?t=…`. 301-ohjaus säilyttää polun ja parametrin, joten ne toimivat. Pidä ohjaus voimassa **vähintään 12 kk**.

## 6. Kirjautuminen ja istunnot

- Istuntoeväste `hg_session` on sidottu domainiin. **Kaikki käyttäjät joutuvat kirjautumaan kerran uudelleen** uudessa osoitteessa – tunnukset ja salasanat eivät muutu.
- Selaimen tallentamat salasanat on tallennettu vanhalle domainille; käyttäjä voi joutua kirjoittamaan salasanan käsin.
- Kerro tästä guruille etukäteen (ks. kohta 8).

## 7. Testaus vaihdon jälkeen

- [ ] `https://hogiguru.fi` aukeaa, SSL-lukko kunnossa
- [ ] `https://www.hogiguru.fi` → ohjautuu pääosoitteeseen
- [ ] `https://guru.konderi.fi/leaderboard` → 301 → `https://hogiguru.fi/leaderboard`
- [ ] Kirjautuminen, Oma joukkue, vaihtotoive, uloskirjautuminen
- [ ] Mobiililla (iOS Safari + Android Chrome)
- [ ] Ylläpito → Tekninen ylläpito → *Testiviesti itselle* ja *Viikkokatsaus itselle*: lähettäjä ja linkit oikein
- [ ] Peruutuslinkki toimii
- [ ] Järjestelmän tila: tilastopäivitykset ja yöllinen varmistus jatkuvat (ajastukset eivät riipu domainista)
- [ ] `curl -sI https://hogiguru.fi/api/leaderboard` → `200`

## 8. Viestintä

- [ ] Ilmoitus guruille muutama päivä ennen: uusi osoite, vanha ohjautuu automaattisesti, kirjaudu kerran uudelleen.
- [ ] Päivitä osoite: WhatsApp-/viestiryhmät, kotisivun kuvaus, mahdolliset somekanavat.
- [ ] Päivitä `README.md` ja `docs/kayttoohje.md`.

## 9. Myöhemmin (kauden jälkeen)

- [ ] Kun vanhalle osoitteelle ei enää tule liikennettä (Cloudflare Analytics zonelle `konderi.fi`), Redirect Rule ja DNS-tietue `guru` voi poistaa. Suositus: aikaisintaan 12 kk vaihdosta.
- [ ] Jos Resendissä vaihdettiin lähettäjä, `konderi.fi`-domainin voi jättää Resendiin (muut konderi.fi-palvelut) tai poistaa.

---

## Pikalista

1. Domain Cloudflareen → 2. `routes` + deploy → 3. kovakoodatut osoitteet + deploy → 4. (valinn.) Resend-domain + `MAIL_FROM` → 5. Redirect Rule vanhalle → 6. testaus → 7. tiedotus.

**Ei muutu:** D1-tietokanta, R2-varmistukset, salaisuudet (`RESEND_API_KEY`), käyttäjätunnukset, ajastukset (cron), liiga.fi-tilastohaku.
