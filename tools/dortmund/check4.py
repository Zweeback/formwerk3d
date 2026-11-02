import numpy as np
d=np.load('out/merged.npz'); print({k:d[k].shape for k in d.files})
b=np.load('out/bcomp.npz'); lab=b['lab']; H=np.load('out/H4.npy'); print('H4',H.shape,float(np.nanmin(H)),float(np.nanmax(H)),int(np.isnan(H).sum()))
bp=d['bp']; bt=d['bt']
# exakte Geländehöhe per bilinearer Interpolation auf dem 4-m-Raster (Raster-Punkt (i,j) bei x=4j, z=-4i)
def hg(x,z):
    fx=np.clip(x/4,0,H.shape[1]-1.001); fz=np.clip(-z/4,0,H.shape[0]-1.001)
    j=fx.astype(int); i=fz.astype(int); u=fx-j; v=fz-i
    return (H[i,j]*(1-u)*(1-v)+H[i,j+1]*u*(1-v)+H[i+1,j]*(1-u)*v+H[i+1,j+1]*u*v)
# je Komponente: tiefster Punkt, Ausdehnung
import collections
ncomp=lab.max()+1
order=np.argsort(lab,kind='stable'); ls=lab[order]; st=np.r_[0,np.flatnonzero(np.diff(ls))+1]; en=np.r_[st[1:],len(ls)]
P=bp[order]
res=[]
for s,e in zip(st,en):
    p=P[s:e]; k=np.argmin(p[:,1]); lo=p[k]
    # Fußpunkte: alle Punkte innerhalb 0.3 m über dem tiefsten
    foot=p[p[:,1]<lo[1]+0.3]
    g=hg(foot[:,0],foot[:,2])
    res.append((len(p),p[:,1].max()-lo[1],np.median(foot[:,1]-g),lo[0],lo[2]))
r=np.array(res)
dd=r[:,2]
print('Komponenten',len(r)); 
for t in (0.5,1,2,5,10): print('Fuß-Median |Δ|<%g m: %.1f %%'%(t,100*np.mean(np.abs(dd)<t)))
print('schwebt >2: %.1f %% | >5: %.1f %% | >10: %.1f %%'%(100*np.mean(dd>2),100*np.mean(dd>5),100*np.mean(dd>10)))
print('versunken >2: %.1f %%'%(100*np.mean(dd<-2)))
# Höhe der Komponenten (Dachhöhe über Sohle) der Schwebenden vs. Rest
fl=dd>2
print('Höhe über Sohle Median: schwebend %.1f m | ok %.1f m'%(np.median(r[fl,1]),np.median(r[~fl,1])))
print('Punkte je Komponente Median: schwebend %d | ok %d'%(np.median(r[fl,0]),np.median(r[~fl,0])))
# räumliche Verteilung: Zelle (512 m)
cx=(r[:,3]//512).astype(int); cz=(-r[:,4]//512).astype(int)
import itertools
cnt=collections.Counter(zip(cx[fl],cz[fl])); tot=collections.Counter(zip(cx,cz))
print('Zellen mit höchstem Anteil schwebend:')
for (a,bb),n in sorted(cnt.items(),key=lambda kv:-kv[1]/tot[kv[0]])[:6]: print(' Zelle',a,bb,'%d von %d'%(n,tot[(a,bb)]))
np.save('out/comp_stats.npy',r)
