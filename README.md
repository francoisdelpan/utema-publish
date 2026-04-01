# UTEMA Sync

Plugin Obsidian desktop-only pour synchroniser un dossier du vault avec un dépôt Git local, en convertissant les liens internes Obsidian en liens Markdown `.md`.

## Ce que fait le plugin

1. parcourt récursivement un dossier configuré du vault ;
2. convertit les wikilinks `[[...]]` en liens Markdown standards ;
3. résout si possible la vraie cible Markdown dans le dossier synchronisé ;
4. convertit aussi les embeds de fichiers non-Markdown `![[image.png]]` vers `![](relative/path.png)` ;
5. exécute un workflow Git local simple :
   - `git add .`
   - `git commit -m "..."`
   - `git pull --rebase <remote> <branch>`
   - `git push` ou `git push <remote> <branch>`

Le plugin est local-first : pas d'API GitHub, pas de token stocké, pas de logique Git réimplémentée.

## Résolution des liens

Le convertisseur ne se contente plus d'ajouter `.md` à la fin d'une cible.

Il essaie d'abord de retrouver le vrai fichier Markdown correspondant dans le dossier synchronisé :

- correspondance exacte sur un chemin relatif ;
- correspondance exacte avec ou sans extension `.md` ;
- correspondance par nom de note quand elle est unique.

Les liens générés sont ensuite écrits en chemins relatifs depuis le fichier source.

Exemples :

```md
[[Ma Page]] -> [Ma Page](Ma%20Page.md)
[[Dossier/Page]] -> [Dossier/Page](Dossier/Page.md)
[[Note]] dans docs/index.md -> [Note](../Note.md)
[[Ma Page|Texte visible]] -> [Texte visible](Ma%20Page.md)
![[image.png]] -> ![image.png](image.png)
![[image.png|640x480]] -> ![image.png](image.png =640x480)
```

Si la cible n'existe pas dans le dossier synchronisé, le plugin pointe vers une page de fallback configurable, par défaut `404.md`.

Les embeds de notes Markdown `![[Ma Note]]` restent inchangés.

Les embeds pointant vers des fichiers non-Markdown résolus dans le dossier synchronisé sont convertis en embeds Markdown classiques.

## Mapping Obsidian -> GitHub

Mappings déjà implémentés :

- `[[Note]]` -> `[Note](Note.md)` ou lien relatif résolu
- `[[Dossier/Note]]` -> `[Dossier/Note](Dossier/Note.md)`
- `[[Note#Section]]` -> `[Note#Section](Note.md#Section)`
- `[[Note^block]]` -> `[Note^block](Note.md#%5Eblock)` selon l'encodage Markdown
- `![[image.png]]` -> `![image.png](image.png)`
- `![[image.png|640x480]]` -> `![image.png](image.png =640x480)`
- callouts Obsidian de type `note`, `tip`, `important`, `warning`, `caution` -> alertes GitHub
- callouts `quote` et `cite` -> blockquotes Markdown classiques

Mappings de callouts actuellement prévus :

- `note`, `abstract`, `summary`, `tldr`, `info`, `todo`, `example`, `question`, `help`, `faq` -> `> [!NOTE]`
- `tip`, `hint` -> `> [!TIP]`
- `important`, `success`, `check`, `done` -> `> [!IMPORTANT]`
- `warning`, `attention`, `bug`, `danger`, `error`, `failure`, `fail`, `missing` -> `> [!WARNING]`
- `caution` -> `> [!CAUTION]`
- `quote`, `cite` -> citation simple avec `>`

Exemples :

```md
> [!tip] Astuce
> Utilise des notes courtes.
```

devient :

```md
> [!TIP]
> **Astuce**
> Utilise des notes courtes.
```

et

```md
> [!quote] Victor Hugo
> La forme, c'est le fond...
```

devient :

```md
> **Victor Hugo**
> La forme, c'est le fond...
```

## Configuration

Dans les settings du plugin :

1. `Folder to sync`
   - chemin relatif dans le vault
   - exemple : `Publish`
2. `Auto moving files folder`
   - dossier racine utilisé par la commande de déplacement rapide du fichier actif
   - exemple : `Inbox/Reviewed`
3. `Remote name`
   - défaut : `origin`
4. `Branch name`
   - défaut : `main`
5. `Repository URL`
   - URL Git attendue pour le remote
   - exemple : `git@github.com:org/repo.git`
6. `SSH key path`
   - chemin local vers la clé SSH privée
   - exemple : `/Users/vous/.ssh/id_ed25519`
7. `Missing link fallback`
   - page Markdown de repli pour les liens vers des notes hors dossier publié
   - exemple : `404.md`
8. `Convert wiki links before sync`
   - active la conversion avant Git
9. `Push mode`
   - `Explicite` : `git push <remote> <branch>`
   - `Simple` : `git push`
10. `Dry run`
   - simule la conversion et la sync Git sans écrire les fichiers ni lancer Git

## Fallback 404

Si une note cible n'est pas présente dans le dossier synchronisé, le lien converti pointera vers la page définie dans `Missing link fallback`.

Exemple de page `404.md` dans le repo publié :

```md
# Document non disponible

Cette page n'est pas publiée dans cet espace.

Retour au [README](README.md).
```

## Fichier de variables

Le dépôt contient un modèle de variables :

[`utema-sync.config.example.json`](/Users/francoisdelpan/Documents/utema-publish/utema-sync.config.example.json)

Copier ce fichier en `utema-sync.config.json` pour garder vos valeurs locales hors Git :

```json
{
  "obsidianVaultPath": "/Users/vous/Documents/MonVaultObsidian",
  "gitRepoUrl": "git@github.com:votre-compte/votre-repo.git",
  "gitSshKeyPath": "/Users/vous/.ssh/id_ed25519"
}
```

Le plugin ne lit pas ce fichier automatiquement : il sert de fiche de configuration locale pour reporter facilement les valeurs dans les settings Obsidian.

## Utilisation

Commande Obsidian :

```text
UTEMA Sync Folder To Git
```

Commande supplémentaire :

```text
UTEMA Move Active File To Auto Folder
```

Cette commande prend le fichier actuellement ouvert, ouvre une mini-modale listant tous les sous-dossiers du dossier racine configuré, puis déplace le fichier dans le dossier sélectionné. Si un fichier du même nom existe déjà, le plugin ajoute un suffixe numérique au nom.

Workflow :

1. saisir un message de commit ;
2. vérifier que le dossier configuré existe ;
3. vérifier qu'il s'agit bien d'un dépôt Git ;
4. convertir les wikilinks des fichiers `.md` ;
5. lancer `git add`, `git commit`, `git pull --rebase`, puis `git push`.

## Développement local

```bash
npm install
npm run build
npm run dev
```

Pour l'installation locale dans Obsidian, copier le dossier compilé dans :

```text
<vault>/.obsidian/plugins/utema-publish/
```

Fichiers attendus :

- `main.js`
- `manifest.json`
- `styles.css`
- `versions.json`

## Limites actuelles

- pas de résolution automatique des conflits Git si le `pull --rebase` échoue ;
- pas de support complet des embeds de notes Markdown `![[Ma Note]]` ;
- pas de résolution complète des cas exotiques du graph Obsidian ;
- en cas de doublon de notes portant le même nom, la conversion garde un fallback simple si la cible n'est pas déterminable sans ambiguïté.

## Mise en route réelle dans Obsidian

1. Préparer le dépôt Git distant.
   - créer un repo vide sur GitHub, GitLab ou autre
   - récupérer son URL SSH, par exemple `git@github.com:mon-compte/mes-notes.git`
2. Créer une clé SSH si vous n'en avez pas.
   - commande : `ssh-keygen -t ed25519 -C "obsidian-sync"`
   - accepter le chemin proposé, par exemple `/Users/vous/.ssh/id_ed25519`
   - copier la clé publique avec `cat ~/.ssh/id_ed25519.pub`
   - coller cette clé publique dans GitHub ou GitLab, section SSH keys
3. Préparer le dossier du vault à synchroniser.
   - dans votre vault Obsidian, créer par exemple `Publish/`
   - ouvrir un terminal dans ce dossier
   - lancer `git init`
   - lancer `git remote add origin <URL_SSH_DU_REPO>`
   - si besoin, créer la branche principale avec `git branch -M main`
4. Installer le plugin local dans Obsidian.
   - builder le plugin avec `npm install` puis `npm run build`
   - copier ce dossier dans `<votre-vault>/.obsidian/plugins/utema-publish/`
   - vérifier que `main.js`, `manifest.json` et `styles.css` sont bien présents
5. Activer le plugin.
   - dans Obsidian, ouvrir `Settings`
   - ouvrir `Community plugins`
   - désactiver `Restricted mode` si nécessaire
   - activer `UTEMA Sync`
6. Remplir les settings du plugin.
   - `Folder to sync` : par exemple `Publish`
   - `Remote name` : `origin`
   - `Branch name` : `main`
   - `Repository URL` : l'URL SSH du repo
   - `SSH key path` : le chemin de votre clé privée
   - laisser `Convert wiki links before sync` activé
7. Faire le premier test.
   - créer une note dans `Publish/`
   - ajouter un lien Obsidian comme `[[Une autre note]]`
   - lancer la commande `UTEMA Sync Folder To Git`
   - saisir un message de commit
8. Vérifier le résultat.
   - le plugin convertit les liens en `.md`
   - il commit les changements locaux
   - il exécute ensuite `git pull --rebase origin main`
   - puis il pousse avec `git push origin main`

Si le premier `pull --rebase` échoue parce que le repo distant est vide ou n'a pas encore de branche initiale, faire un premier push manuel depuis le terminal après le premier commit local.
