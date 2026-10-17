"""Generoi sivuston taustakuvan: jäähalli ylhäältä kuvattuna (kaukalo merkintöineen, vaihtopenkit,
jäähypenkit, katsomot portaineen ja videokuutio). Tulos: public/arena-bg-v2.svg.
Kuva on tarkoituksella täysvärinen; haalistus tehdään CSS:ssä (.arena-bg)."""
import math, random

W, H = 2400, 1500
CX, CY = W / 2, H / 2
M = 1200 / 61  # px per metri (kaukalo 61 x 30 m)
RW, RH, RR = 61 * M, 30 * M, 8.5 * M
X0, Y0 = CX - RW / 2, CY - RH / 2
random.seed(7)
o = []
a = o.append


def rrect(x, y, w, h, r, **kw):
    attrs = ' '.join(f'{k.replace("_", "-")}="{v}"' for k, v in kw.items())
    return f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{r:.1f}" {attrs}/>'


a(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice">')
a('''<defs>
<radialGradient id="ice" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#f4f9ff"/><stop offset="1" stop-color="#cfe0f2"/></radialGradient>
<radialGradient id="light" cx="50%" cy="50%" r="55%"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<linearGradient id="seatA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e3a8a"/><stop offset="1" stop-color="#172554"/></linearGradient>
<pattern id="crowd" width="14" height="14" patternUnits="userSpaceOnUse">
  <rect width="14" height="14" fill="#14254f"/>
  <circle cx="4" cy="4" r="3" fill="#2b4a8f"/><circle cx="11" cy="10" r="3" fill="#36589f"/>
  <circle cx="11" cy="3" r="2" fill="#1d3570"/><circle cx="4" cy="11" r="2.4" fill="#4065ad"/>
</pattern>
</defs>''')

# Hallin lattia ja katto-/valaistusvarjo
a(f'<rect width="{W}" height="{H}" fill="#0a1328"/>')

# Katsomot: sisäkkäiset pyöristetyt renkaat, rivit viivoina, portaat (käytävät) poikki
tiers = [(14, 330, '#14254f'), (360, 560, '#101e42')]
for t0, t1, col in tiers:
    a(rrect(X0 - t1, Y0 - t1, RW + 2 * t1, RH + 2 * t1, RR + t1, fill='url(#crowd)'))
    a(rrect(X0 - t0, Y0 - t0, RW + 2 * t0, RH + 2 * t0, RR + t0, fill='#0a1328'))
    # penkkirivit
    for d in range(t0 + 10, t1, 15):
        a(rrect(X0 - d, Y0 - d, RW + 2 * d, RH + 2 * d, RR + d, fill='none', stroke='#0a1328', stroke_width='3', stroke_opacity='.55'))
    a(rrect(X0 - t1, Y0 - t1, RW + 2 * t1, RH + 2 * t1, RR + t1, fill='none', stroke='#0a1328', stroke_width='10'))
# Käytävät katsomoiden välissä ja lohkojen rajoina
a(rrect(X0 - 345, Y0 - 345, RW + 690, RH + 690, RR + 345, fill='none', stroke='#1b2c55', stroke_width='26'))
for i in range(-5, 6):
    x = CX + i * 115
    for y1, y2 in ((Y0 - 560, Y0 - 60), (Y0 + RH + 60, Y0 + RH + 560)):
        a(f'<line x1="{x:.1f}" y1="{y1:.1f}" x2="{x:.1f}" y2="{y2:.1f}" stroke="#0a1328" stroke-width="7"/>')
for j in (-1, 0, 1):
    y = CY + j * 170
    for x1, x2 in ((X0 - 560, X0 - 20), (X0 + RW + 20, X0 + RW + 560)):
        a(f'<line x1="{x1:.1f}" y1="{y:.1f}" x2="{x2:.1f}" y2="{y:.1f}" stroke="#0a1328" stroke-width="7"/>')
# Kulmien viistot käytävät
for sx in (-1, 1):
    for sy in (-1, 1):
        cx, cy = CX + sx * (RW / 2 - RR), CY + sy * (RH / 2 - RR)
        for ang in (30, 60):
            r = math.radians(ang)
            dx, dy = sx * math.cos(r), sy * math.sin(r)
            a(f'<line x1="{cx + dx * (RR + 20):.1f}" y1="{cy + dy * (RR + 20):.1f}" x2="{cx + dx * (RR + 560):.1f}" y2="{cy + dy * (RR + 560):.1f}" stroke="#0a1328" stroke-width="7"/>')

# Laidat ja jää
a(rrect(X0 - 14, Y0 - 14, RW + 28, RH + 28, RR + 14, fill='#e5edf7'))
a(rrect(X0 - 6, Y0 - 6, RW + 12, RH + 12, RR + 6, fill='#c3d3e6'))
a(rrect(X0, Y0, RW, RH, RR, fill='url(#ice)'))

# Vaihtopenkit (yläreuna) ja jäähyaitiot + toimitsijat (alareuna)
for sx in (-1, 1):
    a(rrect(CX + sx * 70 - (0 if sx > 0 else 380), Y0 - 52, 380, 38, 4, fill='#1f2f57', stroke='#c3d3e6', stroke_width='3'))
    a(rrect(CX + sx * 50 - (0 if sx > 0 else 150), Y0 + RH + 14, 150, 36, 4, fill='#1f2f57', stroke='#c3d3e6', stroke_width='3'))
a(rrect(CX - 50, Y0 + RH + 14, 100, 36, 4, fill='#2b3d6b', stroke='#c3d3e6', stroke_width='3'))

# Merkinnät
red, blue = '#d83a3a', '#2563eb'
a(f'<g fill="none">')
a(f'<line x1="{CX}" y1="{Y0}" x2="{CX}" y2="{Y0 + RH}" stroke="{red}" stroke-width="{0.3 * M:.1f}" stroke-dasharray="14 6"/>')
for sx in (-1, 1):
    bx = CX + sx * 5.85 * M
    a(f'<line x1="{bx}" y1="{Y0}" x2="{bx}" y2="{Y0 + RH}" stroke="{blue}" stroke-width="{0.3 * M:.1f}"/>')
    gx = CX + sx * (RW / 2 - 4 * M)
    # maaliviiva (rajattu kaukalon kaarteeseen)
    dy = math.sqrt(max(0, RR ** 2 - (RR - 4 * M) ** 2))
    a(f'<line x1="{gx}" y1="{Y0 + RR - dy:.1f}" x2="{gx}" y2="{Y0 + RH - RR + dy:.1f}" stroke="{red}" stroke-width="3"/>')
    # maalialue ja maali
    a(f'<path d="M{gx},{CY - 1.8 * M:.1f} A{1.8 * M:.1f},{1.8 * M:.1f} 0 0 {1 if sx < 0 else 0} {gx},{CY + 1.8 * M:.1f} Z" fill="#7cb7f0" fill-opacity=".55" stroke="{red}" stroke-width="2"/>')
    a(f'<rect x="{gx if sx > 0 else gx - 1.12 * M:.1f}" y="{CY - 0.915 * M:.1f}" width="{1.12 * M:.1f}" height="{1.83 * M:.1f}" fill="#f8fafc" stroke="{red}" stroke-width="3"/>')
    # aloitusympyrät ja pisteet
    fx = gx - sx * 6 * M
    for fy in (CY - 7 * M, CY + 7 * M):
        a(f'<circle cx="{fx:.1f}" cy="{fy:.1f}" r="{4.5 * M:.1f}" stroke="{red}" stroke-width="3"/>')
        a(f'<circle cx="{fx:.1f}" cy="{fy:.1f}" r="{0.3 * M:.1f}" fill="{red}"/>')
        for hx in (-1, 1):
            for hy in (-1, 1):
                a(f'<path d="M{fx + hx * 0.75 * M:.1f},{fy + hy * 0.3 * M:.1f} h{hx * 0.6 * M:.1f} M{fx + hx * 0.75 * M:.1f},{fy + hy * 0.3 * M:.1f} v{hy * 0.9 * M:.1f}" stroke="{red}" stroke-width="2"/>')
        a(f'<circle cx="{bx + sx * 1.5 * M:.1f}" cy="{fy:.1f}" r="{0.3 * M:.1f}" fill="{red}"/>')
a(f'<circle cx="{CX}" cy="{CY}" r="{4.5 * M:.1f}" stroke="{blue}" stroke-width="3"/>')
a(f'<circle cx="{CX}" cy="{CY}" r="{0.15 * M:.1f}" fill="{blue}"/>')
a(f'<path d="M{CX - 3 * M:.1f},{Y0 + RH} A{3 * M:.1f},{3 * M:.1f} 0 0 1 {CX + 3 * M:.1f},{Y0 + RH}" stroke="{red}" stroke-width="2"/>')
a('</g>')

# Kattovalojen heijastus
a(f'<ellipse cx="{CX}" cy="{CY}" rx="{RW * 0.6:.0f}" ry="{RH * 0.7:.0f}" fill="url(#light)"/>')
for i in range(-3, 4):
    for j in (-1, 1):
        a(f'<circle cx="{CX + i * 180}" cy="{CY + j * 230}" r="70" fill="#fff" fill-opacity=".05"/>')
a('</svg>')
open('public/arena-bg-v2.svg', 'w').write('\n'.join(o))
print('ok', sum(len(x) for x in o), 'tavua')
