# HogiGuru – nykyisen Excelin analyysi (HG All stars laskin 2026-2027.xlsb)

## Välilehdet
| Välilehti | Sisältö | Lähde |
|---|---|---|
| Tilanne | Leaderboard: 53 gurua, sija + pisteet. Lähdelinkit. | Laskettu |
| All-star kentät | 53 gurun kentälliset sarakkeittain (B…BB) | Draft + vaihdot |
| Vaihdot | Vaihtoloki: tekijä, avain (tekijä+pelaaja), pvm, uusi pelaaja, HG-pisteet vaihtohetkellä, pois vaihdetun pisteet vaihtohetkellä. Tällä hetkellä tyhjä. | Käsin |
| Liigan Pistepörssi | 463 kenttäpelaajaa: GP, G, A, P, PIM, +/-, PPG, SHG, GWG, SOG, SH% | quanthockey.com (copy-paste) |
| Maalivahdit | 68 mv:tä: GP, GAA, SV%, W, L, T, SO, TOI, SVS, GA | eliteprospects.com (copy-paste) |
| Liiga Sarjataulukko | 16 joukkuetta: O, 3P, 2P, 1P, 0P, P, P/O, TM, PM, ME | jatkoaika.com (copy-paste) |

## Gurun kentällinen (All-star kentät)
- Valmentaja ×2 (joukkue + pisteet + "Potkut" -10 jos valmentaja erotetaan)
- Maalivahti ×2
- Puolustaja ×2 (+ vaihtorivit)
- Hyökkääjä ×3 (+ vaihtorivit)
- "vaihtoja jäljellä" -laskuri
- Pisteet yhteensä = Tilanne-välilehden luku

## Pisteytyskaavat (vahvistettu .xlsx-kaavoista ja tarkistettu laskemalla)
| Rooli | Kaava |
|---|---|
| Hyökkääjä | 1.5·G + 0.9·A + 0.1·PIM + 0.4·(+/-) − 0.5·GP |
| Puolustaja | 2.5·G + 1.5·A + 0.1·PIM + 0.4·(+/-) − 0.5·GP |
| Maalivahti | 2·SO + 0.1·SVS − 1·GA |
| Valmentaja | 0.5 · joukkueen sarjapisteet |
| Valmentajan potkut | −10 (käsin syötetty) |

Tarkistukset: Haapala (F) 3+5.4+0.2+2−5.5 = 5.1 ✓, Stenqvist (D) 12+0.4+1.2−5.5 = 8.1 ✓, Raanta (MV) 5.3−7 = −1.7 ✓.

**Vaihdot**: uuden pelaajan kaavaan on kovakoodattu vähennys (esim. `…-9.2`) = pelaajan pisteet vaihtohetkellä,
eli uusi pelaaja tuottaa vain vaihdon jälkeen kertyneet pisteet. Pois vaihdetun pelaajan pisteet jäädytetään arvona.
Sama logiikka valmentajille (`…-6.5`).

**Leaderboard**: `HLOOKUP` hakee rivin 44 summan → järjestys makrolla.

**Datayhteydet**: vanhoja liiga.fi-web-kyselyitä kausilta 2014–2018, rikki uudistuksen jälkeen.

## Havaitut ongelmat
1. **Copy-paste-data rikkoutuu**: Maalivahtien GAA ja sarjataulukon TM-sarake ovat muuttuneet päivämääriksi (esim. 46174 = 2.4.2026).
2. **Nimiin tarttuu roskaa**: "Finland flagAntti Raanta", "...Los Angeles Kings logo" → nimihaku on hauras.
3. **Nimipohjainen yhdistäminen** kolmen eri lähteen välillä (eri kirjoitusasut, ääkköset).
4. **Kaavat eivät näy .xlsb-muodosta** → pisteytyskaava pitää vahvistaa (.xlsx-kopio).
5. Valmentajanimissä kirjoitusvirheitä (esim. "Jarno Pikkaraiaen").
