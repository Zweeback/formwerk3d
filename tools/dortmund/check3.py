import numpy as np, sys
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
d=np.load('out/merged.npz'); bp,bt=d['bp'],d['bt']; H=np.load('out/H4.npy')
# Gebäude = zusammenhängende Dreiecksgruppen (gemeinsame Punkte nach Position verschweißt)
q=np.round(bp*100).astype(np.int64); _,inv=np.unique(q,axis=0,return_inverse=True); inv=inv.reshape(-1)
tri=inv[bt]; n=inv.max()+1
r=np.concatenate([tri[:,0],tri[:,1],tri[:,2]]); c=np.concatenate([tri[:,1],tri[:,2],tri[:,0]])
g=coo_matrix((np.ones(len(r),np.int8),(r,c)),shape=(n,n)); nc,lab=connected_components(g,directed=False)
vl=lab[inv]   # Komponente je Originalpunkt
print('Gebäude (zusammenhängende Teile):',nc)
# je Komponente: tiefster Punkt und dessen Gelände
order=np.argsort(vl,kind='stable'); vls=vl[order]; ys=bp[order,1]; starts=np.r_[0,np.flatnonzero(np.diff(vls))+1]
mn=np.minimum.reduceat(ys,starts); comp=vls[starts]
# Position des tiefsten Punkts
pos=bp[order]; arg=np.array([s+np.argmin(ys[s:e]) for s,e in zip(starts,np.r_[starts[1:],len(ys)])]); low=pos[arg]
ix=np.clip(np.rint(low[:,0]/4).astype(int),0,H.shape[1]-1); iz=np.clip(np.rint(-low[:,2]/4).astype(int),0,H.shape[0]-1)
inside=(low[:,0]>=0)&(low[:,0]<=3072)&(low[:,2]<=0)&(low[:,2]>=-4096)
dd=(low[:,1]-H[iz,ix])[inside]
print('im Gelände:',int(inside.sum()),'| außerhalb:',int((~inside).sum()))
print('Sohle minus Gelände: Median %.2f m | 10–90 %%: %.2f..%.2f | innerhalb ±1 m: %.0f %% | schwebt >2 m: %.1f %% | versunken >2 m: %.1f %%'%(np.median(dd),np.quantile(dd,.1),np.quantile(dd,.9),100*np.mean(np.abs(dd)<1),100*np.mean(dd>2),100*np.mean(dd<-2)))
# Ausmaß Gebäude komplett außerhalb: Anteil Dreiecke
ctr=bp[bt].mean(1); out=(ctr[:,0]<0)|(ctr[:,0]>3072)|(ctr[:,2]>0)|(ctr[:,2]<-4096); print('Dreiecke außerhalb Gelände:',int(out.sum()))
np.savez_compressed('out/bcomp.npz',lab=vl,inside=inside,comp=comp)
