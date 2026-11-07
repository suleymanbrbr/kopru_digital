import math, sys, os
OUT = sys.argv[1] if len(sys.argv)>1 else "."
def svg(body, defs=""):
    d = f"<defs>{defs}</defs>" if defs else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img">{d}{body}</svg>\n'
def shadow(rx=60): return f'<ellipse cx="128" cy="238" rx="{rx}" ry="8" fill="#000" opacity=".13"/>'
def eye(cx, cy, r, col="#2A1A38"):
    return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{col}"/><circle cx="{cx+r*.3:.1f}" cy="{cy-r*.35:.1f}" r="{r*.38:.1f}" fill="#fff"/>'
            f'<circle cx="{cx-r*.35:.1f}" cy="{cy+r*.4:.1f}" r="{r*.18:.1f}" fill="#fff" opacity=".8"/>')
def flame(x, y, h, w, c, c2=None):
    p = f'<path d="M{x-w} {y}C{x-w} {y-h*.4} {x-w*.2} {y-h*.55} {x} {y-h}C{x+w*.2} {y-h*.55} {x+w} {y-h*.4} {x+w} {y}Z" fill="{c}"/>'
    if c2: p += f'<path d="M{x-w*.5} {y}C{x-w*.5} {y-h*.25} {x-w*.1} {y-h*.35} {x} {y-h*.62}C{x+w*.1} {y-h*.35} {x+w*.5} {y-h*.25} {x+w*.5} {y}Z" fill="{c2}"/>'
    return p
def mirror(inner): return f'<g transform="translate(256 0) scale(-1 1)">{inner}</g>'
def both(inner): return inner + mirror(inner)
def gear(cx, cy, r, teeth, c, hole=None, hc="#fff"):
    pts=[]
    for i in range(teeth*4):
        a=2*math.pi*i/(teeth*4)
        rr = r if (i%4) in (0,1) else r*0.78
        pts.append(f"{cx+rr*math.cos(a):.1f},{cy+rr*math.sin(a):.1f}")
    s=f'<polygon points="{" ".join(pts)}" fill="{c}"/>'
    if hole: s+=f'<circle cx="{cx}" cy="{cy}" r="{hole}" fill="{hc}"/>'
    return s
def star(cx,cy,r,c,n=4):
    pts=[]
    for i in range(n*2):
        a=math.pi*i/n - math.pi/2
        rr = r if i%2==0 else r*.35
        pts.append(f"{cx+rr*math.cos(a):.1f},{cy+rr*math.sin(a):.1f}")
    return f'<polygon points="{" ".join(pts)}" fill="{c}"/>'
def aura(id, c, op=.45):
    return f'<radialGradient id="{id}"><stop offset=".55" stop-color="{c}" stop-opacity="{op}"/><stop offset="1" stop-color="{c}" stop-opacity="0"/></radialGradient>'

# ---------------- KIVILCIM ----------------
KB,KS,KBL,KF,KF2,KD,KC,KH = "#FF7A3D","#E55F2B","#FFD08A","#FFC247","#FFEBB0","#3B1F4A","#FF5C7A","#FFF1D6"
def kwing(s=1, big=False):
    L = 1.0*s
    return (f'<g transform="translate(166 150) scale({L})"><path d="M0 0C18 -44 60 -66 96 -58C84 -38 90 -22 74 -6C80 12 62 20 52 24C44 30 24 26 0 14Z" fill="{KF}"/>'
            f'<path d="M0 0C30 -30 56 -38 80 -40M10 8C36 -8 56 -14 68 -14" stroke="{KS}" stroke-width="3" fill="none" stroke-linecap="round"/></g>')
def kivilcim(n):
    b = shadow(58 if n<4 else 70)
    defs=""
    if n==1:
        b += f'<ellipse cx="128" cy="150" rx="62" ry="80" fill="{KB}"/><path d="M80 190C100 224 156 224 176 190C168 230 88 230 80 190Z" fill="{KS}"/>'
        b += f'<circle cx="104" cy="120" r="9" fill="{KS}"/><circle cx="150" cy="104" r="7" fill="{KS}"/><circle cx="144" cy="168" r="11" fill="{KS}"/><circle cx="102" cy="168" r="6" fill="{KS}"/>'
        b += f'<ellipse cx="108" cy="100" rx="12" ry="20" fill="#fff" opacity=".28" transform="rotate(20 108 100)"/>'
        b += flame(128,76,44,15,KF,KF2)
        b += f'<path d="M96 146L112 132L124 152L140 130L158 148" stroke="{KD}" stroke-width="4" fill="none" stroke-linejoin="round" stroke-linecap="round"/>'
    elif n==2:
        b += f'<path d="M184 196C216 196 226 170 214 156C212 176 200 184 184 182Z" fill="{KS}"/>' + flame(216,160,32,10,KF,KF2)
        b += f'<ellipse cx="128" cy="160" rx="64" ry="62" fill="{KB}"/><ellipse cx="128" cy="180" rx="38" ry="34" fill="{KBL}"/>'
        b += f'<ellipse cx="96" cy="222" rx="18" ry="10" fill="{KS}"/><ellipse cx="160" cy="222" rx="18" ry="10" fill="{KS}"/>'
        b += f'<path d="M92 108L98 84L116 100Z M164 108L158 84L140 100Z" fill="{KH}"/>'
        b += flame(128,106,38,14,KF,KF2)
        b += eye(102,150,11)+eye(154,150,11)
        b += f'<ellipse cx="82" cy="168" rx="9" ry="6" fill="{KC}" opacity=".7"/><ellipse cx="174" cy="168" rx="9" ry="6" fill="{KC}" opacity=".7"/>'
        b += f'<path d="M118 168Q128 178 138 168" stroke="{KD}" stroke-width="4" fill="none" stroke-linecap="round"/>'
        b += f'<ellipse cx="72" cy="188" rx="12" ry="9" fill="{KB}"/><ellipse cx="184" cy="188" rx="12" ry="9" fill="{KB}"/>'
    elif n==3:
        b += mirror(kwing(.8)) + kwing(.8)
        b += f'<path d="M176 206C226 210 238 170 218 142C216 172 202 190 176 190Z" fill="{KS}"/>' + flame(220,146,40,12,KF,KF2)
        b += f'<ellipse cx="128" cy="180" rx="48" ry="46" fill="{KB}"/><ellipse cx="128" cy="190" rx="30" ry="32" fill="{KBL}"/>'
        b += f'<ellipse cx="102" cy="224" rx="18" ry="9" fill="{KS}"/><ellipse cx="154" cy="224" rx="18" ry="9" fill="{KS}"/>'
        b += f'<ellipse cx="82" cy="182" rx="10" ry="14" fill="{KB}" transform="rotate(24 82 182)"/><ellipse cx="174" cy="182" rx="10" ry="14" fill="{KB}" transform="rotate(-24 174 182)"/>'
        b += f'<path d="M88 78L74 40L108 62Z M168 78L182 40L148 62Z" fill="{KH}"/>'
        b += flame(128,64,40,15,KF,KF2)
        b += f'<circle cx="128" cy="108" r="50" fill="{KB}"/>'
        b += eye(106,108,11)+eye(150,108,11)
        b += f'<ellipse cx="88" cy="126" rx="9" ry="6" fill="{KC}" opacity=".7"/><ellipse cx="168" cy="126" rx="9" ry="6" fill="{KC}" opacity=".7"/>'
        b += f'<path d="M118 126Q128 136 138 126" stroke="{KD}" stroke-width="4" fill="none" stroke-linecap="round"/>'
    elif n==4:
        b += mirror(kwing(1.05)) + kwing(1.05)
        b += f'<path d="M172 212C232 216 246 164 220 128C222 168 208 196 172 196Z" fill="{KS}"/>' + flame(222,134,54,16,KF,KF2)
        b += f'<ellipse cx="128" cy="176" rx="52" ry="52" fill="{KB}"/><ellipse cx="128" cy="186" rx="32" ry="38" fill="{KBL}"/>'
        b += f'<path d="M96 190H160M98 204H158" stroke="{KF}" stroke-width="3" opacity=".8"/>'
        b += f'<path d="M104 230Q98 214 108 212L124 214L120 232Z M152 230Q158 214 148 212L132 214L136 232Z" fill="{KS}"/>'
        b += f'<ellipse cx="78" cy="180" rx="11" ry="16" fill="{KB}" transform="rotate(22 78 180)"/><ellipse cx="178" cy="180" rx="11" ry="16" fill="{KB}" transform="rotate(-22 178 180)"/>'
        b += f'<path d="M86 84C70 64 70 36 86 18C90 40 104 52 112 62Z M170 84C186 64 186 36 170 18C166 40 152 52 144 62Z" fill="{KH}"/>'
        b += flame(112,72,34,10,KF)+flame(144,72,34,10,KF)+flame(128,64,52,16,KF,KF2)
        b += f'<path d="M80 108C80 80 100 62 128 62C156 62 176 80 176 108C176 134 154 150 128 150C102 150 80 134 80 108Z" fill="{KB}"/>'
        b += f'<path d="M92 104Q106 94 118 106M164 104Q150 94 138 106" stroke="{KD}" stroke-width="4" fill="none" stroke-linecap="round"/>'
        b += eye(106,114,10)+eye(150,114,10)
        b += f'<path d="M118 134Q128 142 138 134" stroke="{KD}" stroke-width="4" fill="none" stroke-linecap="round"/>'
        b += f'<path d="M118 150L128 162L138 150Z" fill="{KF}"/>'
    else:
        defs = aura("a",KF,.55)
        b = '<circle cx="128" cy="130" r="124" fill="url(#a)"/>' + shadow(78)
        b += f'<circle cx="128" cy="130" r="108" fill="none" stroke="{KF}" stroke-width="2" stroke-dasharray="3 9" opacity=".8"/>'
        b += mirror(kwing(1.25)) + kwing(1.25)
        b += f'<path d="M172 214C236 220 252 158 220 112C226 164 208 196 172 198Z" fill="{KS}"/>' + flame(222,120,66,18,KF,KF2)
        b += f'<ellipse cx="128" cy="176" rx="54" ry="54" fill="{KB}"/><ellipse cx="128" cy="186" rx="34" ry="40" fill="{KBL}"/>'
        b += f'<path d="M128 156L142 172L128 190L114 172Z" fill="{KC}"/><path d="M128 162L136 172L128 182L120 172Z" fill="#fff" opacity=".7"/>'
        b += f'<path d="M102 230Q94 212 106 210L124 214L120 232Z M154 230Q162 212 150 210L132 214L136 232Z" fill="{KS}"/>'
        b += f'<ellipse cx="76" cy="180" rx="11" ry="17" fill="{KB}" transform="rotate(22 76 180)"/><ellipse cx="180" cy="180" rx="11" ry="17" fill="{KB}" transform="rotate(-22 180 180)"/>'
        b += f'<path d="M86 84C64 66 60 30 80 6C86 34 102 50 112 62Z M170 84C192 66 196 30 176 6C170 34 154 50 144 62Z" fill="{KH}"/>'
        b += flame(100,70,40,10,KF)+flame(156,70,40,10,KF)+flame(114,64,56,12,KF2)+flame(142,64,56,12,KF2)+flame(128,60,70,17,KF,KF2)
        b += f'<path d="M80 108C80 80 100 62 128 62C156 62 176 80 176 108C176 134 154 150 128 150C102 150 80 134 80 108Z" fill="{KB}"/>'
        b += f'<path d="M90 106L118 112L112 98Z M166 106L138 112L144 98Z" fill="{KD}"/>'
        b += eye(108,116,8,"#FFC247")+eye(148,116,8,"#FFC247")
        b += f'<path d="M116 136Q128 144 140 136" stroke="{KD}" stroke-width="4" fill="none" stroke-linecap="round"/>'
        b += star(40,70,9,KF)+star(220,60,7,KF)+star(32,170,6,KF2)+star(228,180,8,KF2)
    return svg(b, defs)

# ---------------- DINAMO ----------------
DB,DS,DL,DD,DA,DG,DR = "#2EC4B6","#1E9C91","#F4F7FB","#26324D","#FFD166","#8CF2E8","#FF6B6B"
def dantenna(x,y,h,bulb=DA):
    return f'<rect x="{x-2.5}" y="{y-h}" width="5" height="{h}" rx="2.5" fill="{DD}"/><circle cx="{x}" cy="{y-h}" r="8" fill="{bulb}"/><circle cx="{x-2}" cy="{y-h-2}" r="2.6" fill="#fff" opacity=".8"/>'
def dface(x,y,w,h,rx,ey,er=9):
    cx=x+w/2
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{DD}"/>'
            f'<rect x="{cx-w*.27-er*.75}" y="{ey-er}" width="{er*1.5}" height="{er*2}" rx="{er*.75}" fill="{DG}"/>'
            f'<rect x="{cx+w*.27-er*.75}" y="{ey-er}" width="{er*1.5}" height="{er*2}" rx="{er*.75}" fill="{DG}"/>'
            f'<path d="M{cx-8} {ey+er+8}Q{cx} {ey+er+14} {cx+8} {ey+er+8}" stroke="{DG}" stroke-width="3.5" fill="none" stroke-linecap="round"/>')
def dinamo(n):
    b = shadow(56 if n<4 else 68); defs=""
    if n==1:
        b += f'<rect x="76" y="62" width="104" height="164" rx="52" fill="{DB}"/><path d="M76 150H180V190Q180 226 128 226Q76 226 76 190Z" fill="{DS}"/>'
        b += f'<rect x="76" y="136" width="104" height="10" fill="{DL}"/>'
        b += f'<ellipse cx="104" cy="96" rx="10" ry="22" fill="#fff" opacity=".3" transform="rotate(14 104 96)"/>'
        b += f'<circle cx="128" cy="108" r="18" fill="{DD}"/><circle cx="128" cy="108" r="10" fill="{DA}"/><circle cx="125" cy="105" r="3" fill="#fff"/>'
        b += dantenna(128,66,16)
        b += f'<circle cx="104" cy="186" r="5" fill="{DL}"/><circle cx="152" cy="186" r="5" fill="{DL}"/>'
    elif n==2:
        b += dantenna(128,98,22)
        b += f'<rect x="62" y="96" width="132" height="116" rx="46" fill="{DB}"/><path d="M62 160H194V168Q194 212 150 212H106Q62 212 62 168Z" fill="{DS}"/>'
        b += dface(80,112,96,62,26,142,10)
        b += f''
        b += f'<circle cx="52" cy="160" r="12" fill="{DA}"/><circle cx="204" cy="160" r="12" fill="{DA}"/>'
        b += f'<rect x="96" y="226" width="26" height="10" rx="5" fill="{DD}"/><rect x="134" y="226" width="26" height="10" rx="5" fill="{DD}"/>'
        b += f'<circle cx="128" cy="190" r="6" fill="{DA}"/>'
    elif n==3:
        b += gear(196,150,26,8,DA,8,DS)
        b += dantenna(128,66,24)
        b += f'<rect x="84" y="142" width="88" height="76" rx="26" fill="{DS}"/><rect x="92" y="150" width="72" height="56" rx="20" fill="{DL}"/>'
        b += f'<circle cx="128" cy="178" r="12" fill="{DA}"/><circle cx="128" cy="178" r="5" fill="#fff"/>'
        b += f'<rect x="52" y="152" width="22" height="46" rx="11" fill="{DB}"/><rect x="182" y="152" width="22" height="46" rx="11" fill="{DB}"/>'
        b += f'<circle cx="63" cy="202" r="10" fill="{DA}"/><circle cx="193" cy="202" r="10" fill="{DA}"/>'
        b += f'<rect x="92" y="212" width="30" height="22" rx="9" fill="{DD}"/><rect x="134" y="212" width="30" height="22" rx="9" fill="{DD}"/>'
        b += f'<rect x="66" y="64" width="124" height="92" rx="40" fill="{DB}"/><rect x="58" y="96" width="14" height="30" rx="7" fill="{DA}"/><rect x="184" y="96" width="14" height="30" rx="7" fill="{DA}"/>'
        b += dface(80,78,96,60,24,106,9)
    elif n==4:
        b += gear(128,160,62,12,DS)+gear(128,160,46,12,DA,0)
        b += dantenna(100,52,20,DR)+dantenna(156,52,20,DR)
        b += f'<rect x="80" y="140" width="96" height="84" rx="28" fill="{DB}"/><rect x="92" y="152" width="72" height="58" rx="20" fill="{DL}"/>'
        b += f'<path d="M110 178H146" stroke="{DS}" stroke-width="4" stroke-linecap="round"/><circle cx="128" cy="190" r="9" fill="{DA}"/>'
        b += f'<rect x="38" y="140" width="40" height="30" rx="14" fill="{DD}"/><rect x="178" y="140" width="40" height="30" rx="14" fill="{DD}"/>'
        b += f'<rect x="46" y="164" width="22" height="48" rx="11" fill="{DB}"/><rect x="188" y="164" width="22" height="48" rx="11" fill="{DB}"/>'
        b += f'<circle cx="57" cy="216" r="11" fill="{DA}"/><circle cx="199" cy="216" r="11" fill="{DA}"/>'
        b += f'<rect x="86" y="216" width="36" height="20" rx="9" fill="{DD}"/><rect x="134" y="216" width="36" height="20" rx="9" fill="{DD}"/>'
        b += f'<path d="M62 76Q62 52 90 52H166Q194 52 194 76V122Q194 148 166 148H90Q62 148 62 122Z" fill="{DB}"/>'
        b += f'<path d="M62 70L46 56V96L62 104Z M194 70L210 56V96L194 104Z" fill="{DS}"/>'
        b += dface(76,68,104,60,24,98,9)
    else:
        defs = aura("a",DG,.5)
        b = '<circle cx="128" cy="130" r="124" fill="url(#a)"/>' + shadow(76)
        b += f'<ellipse cx="128" cy="124" rx="108" ry="30" fill="none" stroke="{DG}" stroke-width="4" opacity=".85" transform="rotate(-18 128 124)"/>'
        b += f'<ellipse cx="128" cy="124" rx="108" ry="30" fill="none" stroke="{DA}" stroke-width="3" stroke-dasharray="4 10" transform="rotate(18 128 124)"/>'
        b += gear(128,36,24,8,DA,8,DS)
        b += gear(128,160,66,12,DS)+gear(128,160,50,12,DA,0)
        b += dantenna(94,50,22,DR)+dantenna(162,50,22,DR)
        b += f'<rect x="78" y="142" width="100" height="84" rx="28" fill="{DB}"/><rect x="90" y="152" width="76" height="60" rx="20" fill="{DD}"/>'
        b += f'<polygon points="128,160 144,182 128,204 112,182" fill="{DG}"/><polygon points="128,168 137,182 128,196 119,182" fill="#fff" opacity=".8"/>'
        b += f'<rect x="34" y="138" width="42" height="32" rx="15" fill="{DA}"/><rect x="180" y="138" width="42" height="32" rx="15" fill="{DA}"/>'
        b += f'<rect x="42" y="164" width="22" height="48" rx="11" fill="{DB}"/><rect x="192" y="164" width="22" height="48" rx="11" fill="{DB}"/>'
        b += f'<circle cx="53" cy="216" r="11" fill="{DG}"/><circle cx="203" cy="216" r="11" fill="{DG}"/>'
        b += f'<rect x="84" y="218" width="36" height="18" rx="9" fill="{DD}"/><rect x="136" y="218" width="36" height="18" rx="9" fill="{DD}"/>'
        b += f'<path d="M60 78Q60 56 88 56H168Q196 56 196 78V122Q196 148 168 148H88Q60 148 60 122Z" fill="{DB}"/>'
        b += f'<path d="M60 70L40 50V100L60 108Z M196 70L216 50V100L196 108Z" fill="{DA}"/>'
        b += f'<path d="M96 56L128 40L160 56Z" fill="{DS}"/>'
        b += dface(74,70,108,60,24,100,9)
        b += star(34,200,7,DG)+star(224,60,8,DA)+star(222,206,6,DG)
    return svg(b, defs)

# ---------------- SEDIR ----------------
SF,SS,SG,SGD,SW,SGL,SD,SC = "#F6E7C8","#E3CFA3","#5BAE6A","#2F7D4F","#8A5A3C","#C8FF9E","#2B3A2E","#F29B8B"
def leaf(x,y,l,ang,c=SG,c2=None):
    p = f'<g transform="translate({x} {y}) rotate({ang})"><path d="M0 0C{l*.35} {-l*.38} {l*.8} {-l*.3} {l} 0C{l*.8} {l*.3} {l*.35} {l*.38} 0 0Z" fill="{c}"/>'
    if c2: p += f'<path d="M2 0H{l*.85}" stroke="{c2}" stroke-width="2" stroke-linecap="round"/>'
    return p+'</g>'
def sface(cx,cy,sc=1,er=9):
    return (eye(cx-24*sc,cy,er)+eye(cx+24*sc,cy,er)+
            f'<ellipse cx="{cx}" cy="{cy+13*sc}" rx="6" ry="4.5" fill="{SD}"/>'
            f'<ellipse cx="{cx-40*sc}" cy="{cy+12*sc}" rx="8" ry="5" fill="{SC}" opacity=".7"/><ellipse cx="{cx+40*sc}" cy="{cy+12*sc}" rx="8" ry="5" fill="{SC}" opacity=".7"/>'
            f'<path d="M{cx-8} {cy+20*sc}Q{cx} {cy+26*sc} {cx+8} {cy+20*sc}" stroke="{SD}" stroke-width="3" fill="none" stroke-linecap="round"/>')
def antler(side, n, glow=False):
    # right antler path from (150,70), side mirrored by caller
    w = "#8A5A3C"; g = SGL if glow else SG
    s = f'<path d="M150 74C156 56 164 40 176 22" stroke="{w}" stroke-width="7" stroke-linecap="round" fill="none"/>'
    if n>=3: s += f'<path d="M160 48C170 46 180 50 188 54" stroke="{w}" stroke-width="5" stroke-linecap="round" fill="none"/>'+leaf(186,52,22,-10,g)
    if n>=4: s += f'<path d="M168 32C176 22 188 20 196 22" stroke="{w}" stroke-width="5" stroke-linecap="round" fill="none"/>'+leaf(194,22,20,-40,g)
    s += leaf(176,22,24,-80,g)
    return s
def sedir(n):
    b = shadow(56 if n<4 else 66); defs=""
    if n==1:
        b += f'<ellipse cx="128" cy="160" rx="52" ry="66" fill="#D9A56B"/><ellipse cx="128" cy="176" rx="38" ry="46" fill="#EBC590"/>'
        b += f'<path d="M72 130C72 96 98 80 128 80C158 80 184 96 184 130C170 120 150 116 128 116C106 116 86 120 72 130Z" fill="{SGD}"/>'
        b += f'<path d="M92 108L104 120M118 100L124 116M146 100L140 116M168 108L156 120" stroke="{SG}" stroke-width="3" stroke-linecap="round"/>'
        b += f'<path d="M128 80V52" stroke="{SGD}" stroke-width="6" stroke-linecap="round"/>' + leaf(128,56,48,-35,SG,SGD)+leaf(128,60,40,-145,SG,SGD)
        b += f'<ellipse cx="106" cy="170" rx="8" ry="16" fill="#fff" opacity=".28" transform="rotate(10 106 170)"/>'
        b += eye(112,176,5)+eye(144,176,5)
    elif n==2:
        b += f'<path d="M180 214C236 220 238 168 206 160C208 188 196 202 180 202Z" fill="{SS}"/>' + leaf(212,166,34,-60,SG,SGD)
        b += f'<path d="M72 92L66 38L112 70Z M184 92L190 38L144 70Z" fill="{SF}"/><path d="M80 82L78 54L100 70Z M176 82L178 54L156 70Z" fill="{SG}"/>'
        b += f'<ellipse cx="128" cy="170" rx="58" ry="54" fill="{SF}"/><ellipse cx="128" cy="190" rx="34" ry="30" fill="#fff" opacity=".7"/>'
        b += f'<ellipse cx="128" cy="116" rx="62" ry="50" fill="{SF}"/>'
        b += leaf(128,70,30,-60,SG,SGD)+leaf(128,70,26,-125,SG,SGD)
        b += sface(128,116,1,10)
        b += f'<ellipse cx="100" cy="224" rx="16" ry="9" fill="{SW}"/><ellipse cx="156" cy="224" rx="16" ry="9" fill="{SW}"/>'
    elif n==3:
        b += f'<path d="M176 216C240 224 252 156 214 124C214 162 204 186 176 196Z" fill="{SS}"/>' + leaf(218,132,40,-70,SG,SGD)+leaf(214,150,28,-20,SGD)
        b += f'<ellipse cx="128" cy="184" rx="50" ry="46" fill="{SF}"/><ellipse cx="128" cy="198" rx="30" ry="28" fill="#fff" opacity=".7"/>'
        b += f'<ellipse cx="102" cy="228" rx="18" ry="9" fill="{SW}"/><ellipse cx="154" cy="228" rx="18" ry="9" fill="{SW}"/>'
        b += f'<path d="M104 142Q128 164 152 142L146 156Q128 170 110 156Z" fill="{SG}"/>'
        b += both(antler(1,2))
        b += f'<path d="M66 100L58 46L108 78Z M190 100L198 46L148 78Z" fill="{SF}"/><path d="M76 90L72 62L98 78Z M180 90L184 62L158 78Z" fill="{SC}" opacity=".8"/>'
        b += f'<path d="M64 112C64 84 92 70 128 70C164 70 192 84 192 112C192 134 176 142 160 142H96C80 142 64 134 64 112Z" fill="{SF}"/>'
        b += f'<path d="M64 120L52 134L72 138Z M192 120L204 134L184 138Z" fill="{SF}"/>'
        b += sface(128,112,1,10)
    elif n==4:
        b += f'<path d="M176 218C244 226 256 148 214 112C216 160 204 186 176 198Z" fill="{SS}"/>' + leaf(216,122,46,-72,SG,SGD)+leaf(210,150,32,-24,SGD)
        b += f'<ellipse cx="128" cy="184" rx="52" ry="48" fill="{SF}"/><ellipse cx="128" cy="198" rx="32" ry="30" fill="#fff" opacity=".7"/>'
        b += f'<ellipse cx="100" cy="230" rx="19" ry="9" fill="{SW}"/><ellipse cx="156" cy="230" rx="19" ry="9" fill="{SW}"/>'
        b += f'<path d="M92 142Q128 172 164 142L172 158Q128 188 84 158Z" fill="{SG}"/>'+leaf(96,158,24,150,SGD)+leaf(160,158,24,30,SGD)
        b += f'<circle cx="128" cy="164" r="8" fill="{SC}"/><circle cx="128" cy="164" r="3" fill="{SGL}"/>'
        b += both(antler(1,3))
        b += f'<path d="M62 100L52 42L106 76Z M194 100L204 42L150 76Z" fill="{SF}"/><path d="M74 90L68 60L98 78Z M182 90L188 60L158 78Z" fill="{SC}" opacity=".8"/>'
        b += f'<path d="M60 112C60 84 90 68 128 68C166 68 196 84 196 112C196 134 180 144 162 144H94C76 144 60 134 60 112Z" fill="{SF}"/>'
        b += f'<path d="M60 120L44 138L70 140Z M196 120L212 138L186 140Z" fill="{SF}"/>'
        b += f'<path d="M128 68L118 86L128 96L138 86Z" fill="{SG}"/>'
        b += sface(128,114,1,10)
    else:
        defs = aura("a",SGL,.6)
        b = '<circle cx="128" cy="124" r="124" fill="url(#a)"/>' + shadow(74)
        b += f'<path d="M176 220C250 230 262 140 214 98C220 154 206 188 176 200Z" fill="{SS}"/>' + leaf(218,112,52,-74,SGL,SG)+leaf(212,142,38,-24,SG,SGD)+leaf(204,172,30,10,SGL)
        b += f'<ellipse cx="128" cy="184" rx="54" ry="48" fill="{SF}"/><ellipse cx="128" cy="198" rx="34" ry="30" fill="#fff" opacity=".7"/>'
        b += f'<ellipse cx="100" cy="230" rx="19" ry="9" fill="{SW}"/><ellipse cx="156" cy="230" rx="19" ry="9" fill="{SW}"/>'
        b += f'<path d="M86 140Q128 178 170 140L182 160Q128 198 74 160Z" fill="{SG}"/>'+leaf(88,160,28,150,SGL)+leaf(168,160,28,30,SGL)
        b += f'<polygon points="128,150 138,166 128,184 118,166" fill="{SGL}"/><polygon points="128,158 133,166 128,176 123,166" fill="#fff"/>'
        b += both(antler(1,4,True))
        b += f'<path d="M60 102L48 38L106 76Z M196 102L208 38L150 76Z" fill="{SF}"/><path d="M72 92L64 56L98 78Z M184 92L192 56L158 78Z" fill="{SC}" opacity=".8"/>'
        b += f'<path d="M58 114C58 84 90 68 128 68C166 68 198 84 198 114C198 136 182 146 162 146H94C74 146 58 136 58 114Z" fill="{SF}"/>'
        b += f'<path d="M58 122L40 142L68 144Z M198 122L216 142L188 144Z" fill="{SF}"/>'
        b += f'<path d="M128 68L116 88L128 100L140 88Z" fill="{SGL}"/>'
        b += sface(128,116,1,10)
        b += leaf(36,70,16,-30,SGL)+leaf(226,60,14,40,SGL)+leaf(30,176,14,20,SG)+leaf(228,196,16,-50,SGL)
    return svg(b, defs)

SC_={("kivilcim",4):.86,("kivilcim",5):.76,("sedir",3):.92,("sedir",4):.88,("sedir",5):.82,("dinamo",5):.92}
for name, fn in (("kivilcim",kivilcim),("dinamo",dinamo),("sedir",sedir)):
    for n in range(1,6):
        t=fn(n); k=SC_.get((name,n))
        if k:
            i=t.index('>',t.index('<svg'))+1; j=t.rindex('</svg>')
            t=t[:i]+f'<g transform="translate(128 238) scale({k}) translate(-128 -238)">'+t[i:j]+'</g>'+t[j:]
        open(f"{OUT}/{name}-{n}.svg","w").write(t)
