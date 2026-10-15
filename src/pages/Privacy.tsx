import type { ReactNode } from 'react';
import { Card, PageHeader } from '../ui';

function S({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-lg tracking-wide text-white">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-slate-300">{children}</div>
    </section>
  );
}

export default function Privacy() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader kicker="EU:n yleinen tietosuoja-asetus (GDPR) art. 13–14" title="Tietosuojaseloste" />
      <Card>
        <div className="space-y-6">
          <p className="text-xs text-slate-500">Päivitetty 15.10.2026</p>

          <S title="1. Rekisterinpitäjä">
            <p>HogiGuru-veikkauksen ylläpitäjä, Toni Joronen. Yhteydenotot: <a className="text-orange-300 hover:underline" href="mailto:toni@konderi.fi">toni@konderi.fi</a>.</p>
          </S>

          <S title="2. Rekisterin nimi ja käyttötarkoitus">
            <p>HogiGuru – Liiga-veikkauksen ja All-Stars-fantasypelin osallistujarekisteri. Tietoja käytetään:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>pelin järjestämiseen: ilmoittautumiset, joukkueet, varaukset, vaihdot ja pisteiden laskenta</li>
              <li>käyttäjätunnusten hallintaan ja kirjautumiseen</li>
              <li>pelaajien tulosten julkaisuun sivustolla (leaderboard, tilastot, Hall of Fame)</li>
              <li>pelin tiedotteisiin ja raportteihin sähköpostitse</li>
              <li>palvelun tietoturvan ylläpitoon ja väärinkäytösten estämiseen</li>
            </ul>
          </S>

          <S title="3. Käsittelyn oikeusperuste">
            <p>Pelin järjestäminen perustuu osallistujan ja ylläpitäjän väliseen sopimukseen (ilmoittautuminen peliin). Sähköpostitiedotteet ja tietoturvalokit perustuvat rekisterinpitäjän oikeutettuun etuun. Viikkoraporteista voi kieltäytyä milloin tahansa.</p>
          </S>

          <S title="4. Käsiteltävät tiedot">
            <ul className="list-disc space-y-1 pl-5">
              <li>nimi, sähköpostiosoite ja (vapaaehtoisesti) puhelinnumero</li>
              <li>joukkueen nimi, veikkaukset, pelaajavaraukset ja vaihdot sekä niistä lasketut pisteet</li>
              <li>salasanan tiiviste (salasanaa itseään ei tallenneta)</li>
              <li>sähköpostiasetukset ja lähetettyjen viestien loki</li>
              <li>tekniset tiedot: kirjautumisistunnot, muutoshistoria sekä IP-osoitteeseen perustuvat yritysrajoitusmerkinnät</li>
            </ul>
          </S>

          <S title="5. Tietolähteet">
            <p>Tiedot saadaan osallistujalta itseltään ilmoittautumisen ja palvelun käytön yhteydessä. Ottelu- ja pelaajatilastot haetaan julkisesta lähteestä <a className="text-orange-300 hover:underline" href="https://liiga.fi" target="_blank" rel="noopener noreferrer">liiga.fi</a>.</p>
          </S>

          <S title="6. Tietojen julkisuus">
            <p>Nimi, joukkueen nimi, joukkueen kokoonpano ja pisteet näkyvät pelin muille osallistujille ja sivuston kävijöille. Sähköpostiosoite ja puhelinnumero eivät näy julkisesti, vaan ainoastaan pelin ylläpitäjille.</p>
          </S>

          <S title="7. Tietojen luovutukset ja käsittelijät">
            <p>Tietoja ei myydä eikä luovuteta markkinointiin. Palvelun toteutuksessa käytetään seuraavia alihankkijoita:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li><b>Cloudflare, Inc.</b> – palvelin, tietokanta ja varmuuskopiot</li>
              <li><b>Resend</b> – sähköpostien lähetys</li>
            </ul>
            <p>Palveluntarjoajat voivat käsitellä tietoja myös EU/ETA-alueen ulkopuolella (Yhdysvallat). Siirrot perustuvat EU:n komission vakiosopimuslausekkeisiin ja/tai EU–US Data Privacy Framework -järjestelyyn.</p>
          </S>

          <S title="8. Säilytysaika">
            <ul className="list-disc space-y-1 pl-5">
              <li>Pelitiedot ja tulokset säilytetään pelin historiaa (Hall of Fame, aiemmat kaudet) varten, kunnes osallistuja pyytää poistoa.</li>
              <li>Puhelinnumero poistetaan, kun sitä ei enää tarvita pelin järjestämiseen.</li>
              <li>Salasanan palautuslinkit vanhenevat tunnissa, ja yritysrajoitusmerkinnät poistetaan automaattisesti.</li>
              <li>Varmuuskopioita säilytetään rajoitetun ajan, jonka jälkeen ne poistetaan automaattisesti.</li>
            </ul>
          </S>

          <S title="9. Tietojen suojaus">
            <p>Palvelu toimii vain salatun HTTPS-yhteyden kautta. Salasanat tallennetaan vahvana tiivisteenä. Ylläpitotoimintoihin pääsevät vain ylläpitäjät, ja ylläpitäjien tekemät muutokset kirjataan. Kirjautumisyrityksiä rajoitetaan.</p>
          </S>

          <S title="10. Rekisteröidyn oikeudet">
            <p>Sinulla on oikeus tarkastaa tietosi, vaatia virheellisten tietojen korjaamista ja tietojesi poistamista, rajoittaa tai vastustaa käsittelyä sekä saada tietosi siirrettävässä muodossa. Pyynnöt voi lähettää osoitteeseen <a className="text-orange-300 hover:underline" href="mailto:toni@konderi.fi">toni@konderi.fi</a>.</p>
            <p>Jos katsot, että tietojasi käsitellään lainvastaisesti, voit tehdä valituksen tietosuojavaltuutetun toimistolle (<a className="text-orange-300 hover:underline" href="https://tietosuoja.fi" target="_blank" rel="noopener noreferrer">tietosuoja.fi</a>).</p>
          </S>

          <S title="11. Evästeet">
            <p>Sivusto käyttää ainoastaan kirjautumisen ylläpitämiseen välttämätöntä istuntoevästettä. Seuranta- tai mainosevästeitä ei käytetä.</p>
          </S>
        </div>
      </Card>
    </div>
  );
}
