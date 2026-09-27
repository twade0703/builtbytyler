import cv2, numpy as np, importlib, sys
import strokes; importlib.reload(strokes)
def cr(pts,n=16):
    p=[pts[0]]+list(pts)+[pts[-1]]; out=[]
    for i in range(1,len(p)-2):
        p0,p1,p2,p3=map(np.array,(p[i-1],p[i],p[i+1],p[i+2]))
        for t in np.linspace(0,1,n,endpoint=False):
            out.append(0.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t**3))
    out.append(np.array(pts[-1])); return np.array(out)
im=cv2.imread('src.jpg'); g=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY)
OX,OY=60,0
c=cv2.cvtColor(cv2.createCLAHE(3.0,(8,8)).apply(g),cv2.COLOR_GRAY2BGR)[760:1800,300-OX:1200]
c=(c*0.55).astype(np.uint8); blk=np.zeros_like(c)
for k,v in strokes.S.items():
    a=(cr(v)+[OX,OY]).astype(np.int32)
    cv2.polylines(c,[a],False,(0,255,255),2,cv2.LINE_AA)
    cv2.polylines(blk,[a],False,(255,255,255),3,cv2.LINE_AA)
cv2.imwrite('overlay.jpg',np.hstack([c,blk]))
