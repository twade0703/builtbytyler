# Builds the hero portrait <svg> from strokes.py -> portrait.svg.html; paste it into index.html .hero__fig.
#
# One layer: the strokes, which draw themselves in top to bottom on load.
# The green/red wave that runs through them every 7 s is not in the markup:
# assets/js/portrait.js sweeps one straight front across the face, ripples the
# lines as it passes and lights them (see the comment there).
import numpy as np, io, strokes
S=strokes.S

def bez(pts):
    """Catmull-Rom through the points, written as cubic Beziers."""
    p=[pts[0]]+list(pts)+[pts[-1]]; P=lambda q:np.array(q,float)
    d=f"M{pts[0][0]} {pts[0][1]}"; L=0
    for i in range(1,len(p)-2):
        p0,p1,p2,p3=map(P,(p[i-1],p[i],p[i+1],p[i+2]))
        c1=p1+(p2-p0)/6; c2=p2-(p3-p1)/6; L+=np.linalg.norm(p2-p1)
        d+=f"C{c1[0]:.0f} {c1[1]:.0f} {c2[0]:.0f} {c2[1]:.0f} {p2[0]:.0f} {p2[1]:.0f}"
    return d,L

# drawn in, top to bottom
items=[]
for k,v in S.items():
    if v[0][1]>v[-1][1]+40: v=v[::-1]
    d,L=bez(v); items.append((min(y for _,y in v),v[0][1],d,L,k))
items.sort(key=lambda t:(t[1],t[0]))
Lmax=max(t[3] for t in items)
out=[]
for ymin,ys,d,L,k in items:
    delay=0.25+1.45*(ys-38)/960
    dur=0.45+0.85*(L/Lmax)
    cls=' class="hp"' if k.startswith('hp') else ''
    out.append(f'<path{cls} pathLength="1" d="{d}" style="--d:{delay:.2f}s;--t:{dur:.2f}s"/>')

I='            '
svg=('<svg class="portrait" viewBox="0 20 820 1000" role="img" aria-label="A line drawing of Tyler Wade">\n'
 f'{I}<defs>\n'
 f'{I}  <linearGradient id="pt-fade" x1="0" y1="0" x2="0" y2="1"><stop offset=".84" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>\n'
 f'{I}  <mask id="pt-mask" maskUnits="userSpaceOnUse" x="0" y="20" width="820" height="1000"><rect x="0" y="20" width="820" height="1000" fill="url(#pt-fade)"/></mask>\n'
 f'{I}</defs>\n'
 f'{I}<g mask="url(#pt-mask)">\n{I}  '+f'\n{I}  '.join(out)+'\n'
 f'{I}</g>\n          </svg>')
io.open('portrait.svg.html','w',encoding='utf-8').write(svg)
print(len(out),'strokes')
