import numpy as np, json, sys
sys.path.insert(0,'.')
from glbio import read_glb
ROOT=sys.argv[1]; idx=json.load(open(ROOT+'/index.json')); cells=idx['cells']; byid={c['id']:c for c in cells}
T={}
for c in cells:
    p,t=read_glb(ROOT+'/'+c['terrain_render']); T[c['id']]=p+np.array(c['offset'],np.float32)
def edge(p,axis,val):
    m=np.isclose(p[:,axis],val,atol=0.01); q=p[m]; return q[np.argsort(q[:,2 if axis==0 else 0])]
res=[]
for c in cells:
    e,n=c['bbox'][0],c['bbox'][1]
    for dname,nid,axis,va,vb in (('Ost','e%d_n%d'%(e+512,n),0,c['offset'][0]+512,None),('Nord','e%d_n%d'%(e,n+512),2,c['offset'][2]-512,None)):
        if nid in T:
            a=edge(T[c['id']],axis,va); b=edge(T[nid],axis,byid[nid]['offset'][0] if axis==0 else byid[nid]['offset'][2])
            d=np.abs(a[:,1]-b[:,1]); res.append((float(d.max()),float(d.mean()),c['id'],nid,dname))
res.sort(reverse=True)
mx=np.array([r[0] for r in res]); print('Nähte gesamt',len(res),'| max Höhensprung >0,05 m:',int((mx>0.05).sum()),'| >0,5 m:',int((mx>0.5).sum()),'| >2 m:',int((mx>2).sum()))
for r in res[:6]: print('  %.2f m (Ø %.2f) %s -> %s (%s)'%r)
# Wandfüße vs Gelände
d=np.load('out/merged.npz'); bp,bt=d['bp'],d['bt']; H=np.load('out/H4.npy')
v0,v1,v2=bp[bt[:,0]],bp[bt[:,1]],bp[bt[:,2]]; n=np.cross(v1-v0,v2-v0); nl=np.linalg.norm(n,axis=1)+1e-9; wall=np.abs(n[:,1])/nl<0.1
W=bp[bt[wall]]  # (m,3,3)
low=W[np.arange(len(W)),np.argmin(W[:,:,1],axis=1)]  # tiefster Punkt je Wanddreieck
ix=np.clip(np.rint(low[:,0]/4).astype(int),0,H.shape[1]-1); iz=np.clip(np.rint(-low[:,2]/4).astype(int),0,H.shape[0]-1)
inside=(low[:,0]>=0)&(low[:,0]<=3072)&(low[:,2]<=0)&(low[:,2]>=-4096)
dd=(low[:,1]-H[iz,ix])[inside]
print('Wandfüße (Wanddreiecke %d): Δ zum Gelände Median %.2f m | 25–75 %%: %.2f..%.2f | |Δ|<1 m: %.0f %% | Wand-Fuß >2 m über Gelände (schwebt): %.1f %% | >2 m darunter: %.1f %%'%(
  len(W),np.median(dd),np.quantile(dd,.25),np.quantile(dd,.75),100*np.mean(np.abs(dd)<1),100*np.mean(dd>2),100*np.mean(dd<-2)))
