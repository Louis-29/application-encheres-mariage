# Application d'encheres de mariage

Application web installable sur mobile pour organiser une vente aux encheres pendant un mariage.

## Fonctions incluses

- catalogue des objets a encherir ;
- encheres avec prenom et montant ;
- statistiques rapides ;
- espace Admin protege par mot de passe ;
- ajout, suppression, import et export des lots ;
- QR code de partage ;
- installation mobile via PWA ;
- synchronisation temps reel avec Supabase quand les cles sont configurees.

## Lancer en local

Ouvre `index.html` dans un navigateur pour tester rapidement.

Pour tester l'installation PWA et le service worker, sers le dossier avec un petit serveur local :

```powershell
npx serve .
```

Puis ouvre `http://localhost:3000` ou l'adresse indiquee par la commande.

## Supabase temps reel

1. Cree un projet sur Supabase.
2. Va dans SQL Editor et execute le contenu de `supabase-schema.sql`.
3. Va dans Project Settings > API.
4. Recupere l'URL du projet et la cle `anon` / `public`.
5. Remplis `supabase-config.js` :

```js
window.AUCTION_SUPABASE = {
  url: "https://ton-projet.supabase.co",
  anonKey: "ta-cle-anon"
};
```

6. Envoie les fichiers modifies sur GitHub.

Vercel redeploiera automatiquement l'application.

Le mot de passe admin par defaut cote Supabase est `mariage2026`. Pour le changer avant installation, modifie la ligne `digest('mariage2026', 'sha256')` dans `supabase-schema.sql`.
