# UTEMA Publish

Plugin Obsidian local, minimaliste et desktop-only pour :

1. convertir les liens wiki `[[...]]` d'un dossier du vault en liens Markdown classiques ;
2. exécuter un workflow Git local simple :
   - `git add .`
   - `git commit -m "..."`
   - `git push` ou `git push <remote> <branch>`

Le plugin est pensé pour un usage interne, local-first, sans GitHub API, sans token stocké, et sans logique Git réimplémentée.

## Structure

```text
utema-publish/
├── .gitignore
├── commitModal.ts
├── esbuild.config.mjs
├── gitService.ts
├── linkConverter.ts
├── main.ts
├── manifest.json
├── package.json
├── README.md
├── settings.ts
├── styles.css
├── tsconfig.json
└── versions.json
```

## Choix d'implémentation V1

- Desktop only : le plugin utilise Node/Electron via Obsidian Desktop.
- Exécution shell : via `child_process.execFile`, sans dépendance npm supplémentaire.
- Push mode par défaut : `explicit`, donc `git push origin main`.
- Vérifications avant action :
  - le dossier configuré existe ;
  - le dossier configuré est un dépôt Git valide ;
  - si aucun changement n'est détecté, le plugin s'arrête proprement.

## Initialisation depuis le template officiel Obsidian

Si tu veux repartir du template officiel :

```bash
git clone https://github.com/obsidianmd/obsidian-sample-plugin.git utema-publish
cd utema-publish
```

Ensuite :

1. remplace les fichiers du template par ceux fournis dans ce dossier ;
2. garde `manifest.json`, `package.json`, `tsconfig.json` et `esbuild.config.mjs` alignés avec cette version ;
3. lance l'installation npm.

Tu peux aussi simplement utiliser directement ce dossier `utema-publish/` comme base de travail locale.

## Installation locale pas à pas

### 1. Installer les dépendances

```bash
cd utema-publish
npm install
```

### 2. Builder le plugin

```bash
npm run build
```

Cela génère principalement :

- `main.js`
- `manifest.json`
- `styles.css`

### 3. Copier le plugin dans Obsidian

Copie le dossier compilé dans ton vault Obsidian :

```text
<ton-vault>/.obsidian/plugins/utema-publish/
```

Les fichiers importants à avoir dans ce dossier :

- `main.js`
- `manifest.json`
- `styles.css`
- éventuellement `versions.json`

En pratique, pour un plugin local interne, tu peux copier tout le dossier.

### 4. Activer le plugin

Dans Obsidian :

1. ouvre `Settings`
2. va dans `Community plugins`
3. désactive `Restricted mode` si les community plugins sont bloqués
4. active le plugin `UTEMA Publish`

## Configuration

Dans l'onglet de settings du plugin :

1. `Publish folder`
   - chemin relatif dans le vault
   - exemple : `Publish`

2. `Remote name`
   - défaut : `origin`

3. `Branch name`
   - défaut : `main`

4. `Convert wiki links before publish`
   - défaut : `true`

5. `Push mode`
   - `Explicite` : `git push <remote> <branch>`
   - `Simple` : `git push`

6. `Dry run`
   - simule la conversion et le workflow Git sans écrire les fichiers ni lancer Git

## Utilisation

### Command Palette

La commande disponible dans Obsidian est :

```text
UTEMA Publish
```

### Raccourci clavier

Pour lui assigner un raccourci :

1. va dans `Settings`
2. ouvre `Hotkeys`
3. cherche `UTEMA Publish`
4. définis le raccourci souhaité

### Workflow d'exécution

Quand la commande est lancée :

1. une modale demande un message de commit ;
2. le plugin valide le dossier cible ;
3. le plugin vérifie que ce dossier est bien un dépôt Git ;
4. les fichiers `.md` du dossier sont parcourus récursivement ;
5. les liens wiki sont convertis si l'option est activée ;
6. si aucun changement n'est détecté :
   - message Obsidian : `Aucun changement à publier.`
7. sinon :
   - `git add .`
   - `git commit -m "<message>"`
   - `git push` ou `git push <remote> <branch>`
8. si tout se passe bien :
   - message Obsidian : `Publication terminée.`

## Comportement de conversion des liens

Cas V1 gérés :

```md
[[Ma Page]] -> [Ma Page](Ma%20Page.md)
[[Ma Page|Texte visible]] -> [Texte visible](Ma%20Page.md)
[[Dossier/Page]] -> [Dossier/Page](Dossier/Page.md)
```

Comportement actuel :

- seuls les fichiers `.md` sont traités ;
- les dossiers `.git`, `.obsidian` et `node_modules` sont ignorés ;
- les embeds `![[...]]` sont laissés inchangés en V1 ;
- la cible du lien est convertie en chemin `.md` simple, avec encodage URL des segments ;
- les fragments simples `#ancre` et `^block` ont une structure prévue, mais restent une prise en charge légère.

## Commandes npm utiles

```bash
npm install
npm run build
npm run dev
```

## Limites connues de la V1

- pas de résolution avancée du graph Obsidian ;
- pas de prise en charge complète des cas exotiques de liens ;
- pas de traitement avancé des embeds `![[...]]` ;
- pas de rollback multi-fichiers si une erreur survient en plein milieu d'une série de conversions ;
- le plugin suppose que Git est installé et déjà authentifié localement ;
- le plugin suppose que le dossier publié est lui-même le dépôt Git cible.

## Pistes de V2

- meilleure résolution des chemins Obsidian réels ;
- support complet de `[[Page#Ancre]]`, `[[Page#Ancre|Alias]]` et `[[Page^blockid]]` ;
- support de `![[embed]]` ;
- aperçu des fichiers qui vont être modifiés avant validation finale ;
- journal détaillé dans une modale de résultat ;
- option de commit automatique avec message prérempli ;
- filtres supplémentaires sur les fichiers à publier.
