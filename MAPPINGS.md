# Mappings Obsidian -> GitHub

Document de référence pour les conversions réalisées par le plugin lors de la synchronisation d'un dossier Obsidian vers un dépôt Git.

## Sources officielles utilisées

- Obsidian Help: [Basic formatting syntax](https://help.obsidian.md/syntax)
- GitHub Docs: [Basic writing and formatting syntax](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax)
- GitHub Docs: [About READMEs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)

## Principes

- GitHub préfère les liens relatifs et les chemins d'image relatifs.
- Obsidian supporte les wikilinks, les embeds de fichiers, les fragments `#heading`, les références de blocs `^block`, et les callouts.
- Le plugin convertit ce qui a un équivalent GitHub propre.
- Le plugin garde tel quel ce qui n'a pas d'équivalent fiable ou complet.

## Mappings actifs

| Obsidian | GitHub |
| --- | --- |
| `[[Note]]` | `[Note](Note.md)` ou fallback `404.md` si absent |
| `[[Dossier/Note]]` | `[Dossier/Note](Dossier/Note.md)` |
| `[[Note\|Alias]]` | `[Alias](Note.md)` |
| `[[Note#Section]]` | `[Note#Section](Note.md#Section)` |
| `[[Note^bloc]]` | `[Note^bloc](Note.md#%5Ebloc)` |
| `![[image.png]]` | `![image.png](image.png)` |
| `![[image.png\|640x480]]` | `![image.png](image.png =640x480)` |
| `> [!tip]` | `> [!TIP]` |
| `> [!note]` | `> [!NOTE]` |
| `> [!important]` | `> [!IMPORTANT]` |
| `> [!warning]` | `> [!WARNING]` |
| `> [!caution]` | `> [!CAUTION]` |
| `> [!quote]` | `>` blockquote classique |

## Mappings de callouts

### Vers `NOTE`

- `note`
- `abstract`
- `summary`
- `tldr`
- `info`
- `todo`
- `example`
- `question`
- `help`
- `faq`

### Vers `TIP`

- `tip`
- `hint`

### Vers `IMPORTANT`

- `important`
- `success`
- `check`
- `done`

### Vers `WARNING`

- `warning`
- `attention`
- `bug`
- `danger`
- `error`
- `failure`
- `fail`
- `missing`

### Vers `CAUTION`

- `caution`

### Vers blockquote simple

- `quote`
- `cite`

## Cas non convertis volontairement

- embeds de notes Markdown `![[Ma Note]]`
- cas ambigus quand plusieurs notes portent le même nom et qu'aucun chemin exact ne permet de trancher
- comportements Obsidian très spécifiques sans rendu GitHub fidèle

## Fallback des liens absents

Si une note visée n'existe pas dans le dossier synchronisé, le plugin ne tente plus de fabriquer un lien fictif vers cette note et redirige vers une page Markdown de fallback configurable, par défaut `404.md`.

## Pistes de suite

- convertir `![[Note]]` en inclusion ou lien de repli configurable
- normaliser davantage les ancres de headings pour coller au slug GitHub
- gérer explicitement les aliases de callouts plus rares si besoin
