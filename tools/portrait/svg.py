# Builds the hero portrait <svg> from strokes.py -> portrait.svg.html; paste it into index.html .hero__fig.
#
# Two layers of the same strokes:
#   1. the drawing - lines that draw themselves in, top to bottom, on load
#   2. the wave    - a pulse that starts at ONE point and spreads along the
#      lines, jumping across where two lines touch or nearly touch, like a
#      ripple running through the drawing. Green starts bottom-left and runs
#      to top-right; red is the inverse, top-right to bottom-left. They take
#      turns every 7 s (the trading engine's #2BD98A / #FF5C5C).
#
# How the wave is timed: every stroke is sampled densely, and a shortest-path
# search from the seed point gives the time the wave reaches each sample
# (distance / speed; a jump between lines costs a little more than running
# along one, so it prefers the lines). Each stroke is then cut into pieces on
# which that arrival time only rises, and each piece becomes a path drawn in
# the direction the wave travels, with --w = when the wave reaches its start.
# The front is eased (sine in-out over SPAN seconds): gentle start, fast
# through the middle, settling at the far side. Each piece gets its own start
# (--w) and its own dash speed (--run), so its pulse arrives at its far end
# exactly when the front does, and the whole face moves as one wave.
import numpy as np, io, heapq, strokes
S=strokes.S

def bez(pts):
    p=[pts[0]]+list(pts)+[pts[-1]]; P=lambda q:np.array(q,float)
    d=f"M{pts[0][0]} {pts[0][1]}"; L=0
    for i in range(1,len(p)-2):
        p0,p1,p2,p3=map(P,(p[i-1],p[i],p[i+1],p[i+2]))
        c1=p1+(p2-p0)/6; c2=p2-(p3-p1)/6; L+=np.linalg.norm(p2-p1)
        d+=f"C{c1[0]:.0f} {c1[1]:.0f} {c2[0]:.0f} {c2[1]:.0f} {p2[0]:.0f} {p2[1]:.0f}"
    return d,L

def sample(pts, n=14):
    """The same curve bez() draws (Catmull-Rom), as a dense polyline."""
    p=[pts[0]]+list(pts)+[pts[-1]]; out=[]
    for i in range(1,len(p)-2):
        p0,p1,p2,p3=map(lambda q:np.array(q,float),(p[i-1],p[i],p[i+1],p[i+2]))
        for t in np.linspace(0,1,n,endpoint=False):
            out.append(0.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t**3))
    out.append(np.array(pts[-1],float)); return np.array(out)

# ---- layer 1: drawn in, top to bottom ----
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

# ---- layer 2: the wave ----
keys=list(S); polys={k:sample(S[k]) for k in keys}
nodes=[]; idx={}
for k in keys:
    for i,pt in enumerate(polys[k]): idx[(k,i)]=len(nodes); nodes.append((k,i,pt))
P=np.array([n[2] for n in nodes])
adj=[[] for _ in nodes]
for k in keys:                                    # along each line
    for i in range(len(polys[k])-1):
        a,b=idx[(k,i)],idx[(k,i+1)]; w=float(np.linalg.norm(P[a]-P[b]))
        adj[a].append((b,w)); adj[b].append((a,w))
JUMP, JUMP_COST = 95.0, 1.6                       # across a gap between lines
owner=np.array([keys.index(n[0]) for n in nodes])
for a in range(len(nodes)):
    dd=np.linalg.norm(P-P[a],axis=1)
    for b in np.nonzero((dd<JUMP)&(owner!=owner[a]))[0]:
        adj[a].append((int(b),float(dd[b])*JUMP_COST))

def arrival(seed):
    dist=np.full(len(nodes),np.inf); dist[seed]=0; h=[(0.0,seed)]
    while h:
        d0,a=heapq.heappop(h)
        if d0>dist[a]: continue
        for b,w in adj[a]:
            if d0+w<dist[b]: dist[b]=d0+w; heapq.heappush(h,(d0+w,b))
    return dist

SPAN=2.8                                          # seconds for one wave to cross the face

def when(frac):
    """Eased time for a front that has covered frac of the way: sine
    ease-in-out, so the wave leaves gently, runs fast through the middle of
    the face and settles at the far side. Inverse of (1 - cos(pi t)) / 2."""
    frac=min(max(frac,0.0),1.0)
    return SPAN*np.arccos(1-2*frac)/np.pi

def pieces(dist):
    """Cut every stroke where arrival stops rising. Return (start_s, speed, d, is_hp):
    each piece starts when the eased front reaches it and runs at the speed that
    gets its pulse to its far end when the front does."""
    res=[]; far=np.nanmax(dist[np.isfinite(dist)])
    for k in keys:
        a=np.array([dist[idx[(k,i)]] for i in range(len(polys[k]))])
        a=np.where(np.isfinite(a),a,far)
        cut=[0]
        for i in range(1,len(a)-1):
            if (a[i]-a[i-1])*(a[i+1]-a[i])<0: cut.append(i)
        cut.append(len(a)-1)
        for s0,e in zip(cut,cut[1:]):
            seg=list(range(s0,e+1))
            if a[seg[-1]]<a[seg[0]]: seg=seg[::-1]
            if len(seg)<2: continue
            pts=polys[k][seg]
            L=float(np.sum(np.linalg.norm(np.diff(pts,axis=0),axis=1)))
            t0=when(a[seg[0]]/far); t1=when(a[seg[-1]]/far)
            v=L/max(t1-t0,0.06)
            d='M'+' L'.join(f'{x:.0f} {y:.0f}' for x,y in pts[::2].tolist()+[pts[-1].tolist()])
            res.append((t0, v, d, k.startswith('hp')))
    return sorted(res)

def extreme(score):
    return int(np.argmax([score(n[2]) for n in nodes]))

green=arrival(extreme(lambda p: p[1]-p[0]))       # bottom-left-most point
red  =arrival(extreme(lambda p: p[0]-p[1]))       # top-right-most point
def layer(dist, name):
    rows=[]
    for w,v,d,hp in pieces(dist):
        cls=' class="hp"' if hp else ''
        # --run: how far this piece's dash travels in 7 s at its own speed
        rows.append(f'<path{cls} d="{d}" style="--w:{w:.2f}s;--run:{-v*7:.0f}"/>')
    return rows
g_rows=layer(green,'g'); r_rows=layer(red,'r')

I='            '
svg=('<svg class="portrait" viewBox="0 20 820 1000" role="img" aria-label="A line drawing of Tyler Wade">\n'
 f'{I}<defs>\n'
 f'{I}  <linearGradient id="pt-fade" x1="0" y1="0" x2="0" y2="1"><stop offset=".84" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>\n'
 f'{I}  <mask id="pt-mask" maskUnits="userSpaceOnUse" x="0" y="20" width="820" height="1000"><rect x="0" y="20" width="820" height="1000" fill="url(#pt-fade)"/></mask>\n'
 f'{I}</defs>\n'
 f'{I}<g mask="url(#pt-mask)">\n{I}  '+f'\n{I}  '.join(out)+'\n'
 f'{I}  <g class="pt-wave pt-wave--up" aria-hidden="true">\n{I}    '+f'\n{I}    '.join(g_rows)+f'\n{I}  </g>\n'
 f'{I}  <g class="pt-wave pt-wave--down" aria-hidden="true">\n{I}    '+f'\n{I}    '.join(r_rows)+f'\n{I}  </g>\n'
 f'{I}</g>\n          </svg>')
io.open('portrait.svg.html','w',encoding='utf-8').write(svg)
print(len(out),'strokes;',len(g_rows),'green pieces,',len(r_rows),'red pieces; span',SPAN,'s eased; unreached',
      int(np.sum(~np.isfinite(green))),int(np.sum(~np.isfinite(red))))
