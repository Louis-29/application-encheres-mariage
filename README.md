# Application d'encheres de mariage

Premiere version autonome d'une application web installable sur mobile.

## Fonctions incluses

- catalogue des objets a enchérir ;
- ajout et suppression de lots depuis l'onglet Admin ;
- enregistrement des encheres avec prenom et montant ;
- statistiques rapides ;
- export/import JSON des donnees ;
- generation d'un QR code de partage ;
- installation mobile via PWA quand l'application est servie en HTTPS.

## Lancer en local

Ouvre `index.html` dans un navigateur pour tester rapidement.

Pour tester l'installation PWA et le service worker, sers le dossier avec un petit serveur local :

```powershell
npx serve .
```

Puis ouvre `http://localhost:5173`.

## Mise en ligne

Pour que plusieurs invites enchérissent ensemble depuis leur telephone, il faudra heberger l'application et remplacer le stockage local par une petite base partagee. La structure actuelle est prete pour cette evolution.
