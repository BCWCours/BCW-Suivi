# Documentation Base de Données — BCW Suivi

> Base : **Supabase (PostgreSQL)**
> Projet : BCW Suivi — outil interne de suivi des élèves
> Dernière mise à jour : mars 2026

---

## Vue d'ensemble

BCW Suivi utilise **6 tables** au total :

| Table | Rôle |
|---|---|
| `leads` | Demandes d'inscription depuis le site marketing |
| `profiles` | Profils des utilisateurs connectés (profs, élèves, parents) |
| `students` | Fiches élèves |
| `teacher_students` | Liens prof ↔ élève (qui enseigne à qui) |
| `parent_students` | Liens parent ↔ enfant |
| `session_reports` | Rapports de séance rédigés par les profs |

---

## Schéma des tables

### `leads` — Demandes d'inscription

Alimentée automatiquement par le formulaire du site marketing (inscription.html).
**Pas de compte Supabase Auth associé** — c'est juste un CRM simple.

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | Clé primaire auto |
| `name` | text | Nom de l'élève |
| `email` | text | Email de contact |
| `phone` | text | Téléphone |
| `level` | text | Niveau (Primaire / Secondaire / Enseignement supérieur) |
| `subject` | text | Matières demandées (séparées par `\|`) |
| `format` | text | Formule choisie (Cours particuliers / Aide aux devoirs / Préparation examens) |
| `urgency` | text | Urgence (non utilisé pour l'instant, `null`) |
| `message` | text | Message libre + champs supplémentaires packés (parent, école, année) |
| `source` | text | Toujours `"website"` |
| `status` | text | État du lead : `a_contacter` / `contacte` / `converti` / `perdu` |
| `created_at` | timestamptz | Date de réception |

> **Champs packés dans `message`** : quand un parent remplit le formulaire avec le nom du parent, le nom de l'école, et l'année, ces infos sont concaténées dans la colonne `message` au format :
> ```
> Parent : Prénom Nom
> Établissement : Francophone — Lycée Jacqmain
> Année : 4ème
>
> Message : texte libre de l'élève
> ```

---

### `profiles` — Utilisateurs connectés

Chaque utilisateur Supabase Auth a **automatiquement** une ligne dans `profiles` (via trigger).

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | = `auth.users.id` (clé primaire, lien direct) |
| `role` | text | `prof` / `eleve` / `parent` |
| `full_name` | text | Nom complet |
| `phone` | text | Téléphone (optionnel) |
| `created_at` | timestamptz | Date de création du compte |

> **Rôle défini à la création du compte** via `raw_user_meta_data` :
> ```json
> { "role": "prof", "full_name": "Bilal Z.", "phone": "+32489..." }
> ```

---

### `students` — Fiches élèves

Un élève peut exister **sans compte Auth** (créé manuellement par un prof).
Si l'élève crée un compte, on lie via `profile_id`.

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | Clé primaire auto |
| `full_name` | text | Nom de l'élève |
| `level` | text | `secondaire` ou `superieur` |
| `profile_id` | uuid | Lien vers `profiles.id` (null si pas de compte) |
| `created_at` | timestamptz | Date de création de la fiche |

---

### `teacher_students` — Liens Prof ↔ Élève

Clé composite `(teacher_id, student_id)` — pas de doublons possibles.

| Colonne | Type | Description |
|---|---|---|
| `teacher_id` | uuid | → `profiles.id` (rôle prof) |
| `student_id` | uuid | → `students.id` |
| `subjects` | text | Matières enseignées à cet élève par ce prof |

> Bilal, Sami et Walid peuvent chacun avoir leurs propres élèves.
> Un élève peut être suivi par plusieurs profs.

---

### `parent_students` — Liens Parent ↔ Enfant

Clé composite `(parent_id, student_id)`.

| Colonne | Type | Description |
|---|---|---|
| `parent_id` | uuid | → `profiles.id` (rôle parent) |
| `student_id` | uuid | → `students.id` |

> Créé par un prof — le parent n'a pas accès aux outils de gestion.

---

### `session_reports` — Rapports de séance

Cœur de l'outil. Un rapport par séance, rédigé par le prof.

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | Clé primaire auto |
| `teacher_id` | uuid | → `profiles.id` |
| `student_id` | uuid | → `students.id` |
| `session_date` | date | Date de la séance |
| `subjects_covered` | text | Matières vues pendant la séance |
| `strengths` | text | Points forts de l'élève |
| `improvements` | text | Axes d'amélioration |
| `resources_text` | text | Ressources recommandées (texte libre) |
| `resources_files` | text[] | URLs de fichiers joints (tableau) |
| `score` | integer | Note de séance de 1 à 5 |
| `published_at` | timestamptz | Date de publication (null = brouillon, non visible par l'élève) |
| `created_at` | timestamptz | Création du rapport |
| `updated_at` | timestamptz | Mise à jour auto via trigger |

> **Brouillon vs Publié** : tant que `published_at` est `null`, seul le prof voit le rapport.
> Quand le prof publie, `published_at = now()` → l'élève et le parent peuvent le lire.

---

## Diagramme des relations

```
auth.users
    │
    │ (trigger auto)
    ▼
profiles (id, role, full_name, phone)
    │
    ├──────────────────────────────────────────┐
    │ [role=prof]                              │ [role=parent]
    ▼                                          ▼
teacher_students ──► students ◄── parent_students
(teacher_id, student_id)  │   (parent_id, student_id)
                           │
                           │ profile_id (optionnel)
                           ▼
                    profiles [role=eleve]

session_reports
    ├── teacher_id → profiles
    └── student_id → students


leads (indépendant — pas de lien Auth)
```

---

## Rôles et accès (RLS)

### `prof` — Bilal / Sami / Walid

| Table | Accès |
|---|---|
| `profiles` | Voit **tous** les profils |
| `students` | Voit, crée, modifie **ses élèves** (via teacher_students) |
| `teacher_students` | Voit, crée, supprime **ses propres liens** |
| `parent_students` | Voit et crée des liens parents |
| `session_reports` | Voit, crée, modifie **ses propres rapports** |

### `eleve`

| Table | Accès |
|---|---|
| `profiles` | Voit **son propre profil** uniquement |
| `students` | Voit **sa propre fiche** (via profile_id) |
| `session_reports` | Voit **ses rapports publiés** (published_at non null) |

### `parent`

| Table | Accès |
|---|---|
| `profiles` | Voit **son propre profil** uniquement |
| `parent_students` | Voit **ses liens enfants** |
| `session_reports` | Voit les **rapports publiés de ses enfants** |

---

## Triggers automatiques

### 1. `on_auth_user_created` — Création de profil automatique

**Déclenché** : à chaque nouvel utilisateur dans `auth.users`
**Action** : insère une ligne dans `public.profiles` avec les métadonnées du compte

```sql
-- Lors de l'invitation/création d'un compte, passer ces métadonnées :
{ "role": "prof", "full_name": "Walid B.", "phone": "+32..." }
-- → insérées automatiquement dans profiles
```

### 2. `set_updated_at` — Horodatage automatique

**Déclenché** : avant chaque UPDATE sur `session_reports`
**Action** : met à jour `updated_at = now()` automatiquement

---

## Cheminement complet — du lead au rapport

```
1. DEMANDE (site marketing)
   └── Élève remplit inscription.html
   └── → ligne créée dans leads (status: a_contacter)

2. CONTACT (CRM manuel)
   └── Bilal/Sami/Walid contacte le lead
   └── → status mis à jour: contacte → converti

3. CRÉATION DU COMPTE ÉLÈVE
   └── Prof invite l'élève via Supabase Auth
       (avec metadata: role=eleve, full_name, phone)
   └── → trigger crée profil dans profiles
   └── → prof crée la fiche dans students + lie via teacher_students

4. (OPTIONNEL) LIEN PARENT
   └── Prof crée un compte parent + lie via parent_students

5. RAPPORT DE SÉANCE
   └── Prof rédige le rapport dans BCW-Suivi
   └── → sauvegardé en brouillon (published_at = null)
   └── Prof publie → published_at = now()
   └── → élève et parent voient le rapport dans leur espace
```

---

## Notes de développement

- **Pas de migration nécessaire** pour les nouveaux champs du formulaire d'inscription — ils sont packés dans la colonne `message` de `leads`.
- La colonne `status` sur `leads` est optionnelle (commentée dans le schema) — à activer si un CRM interne est développé.
- `resources_files` est un tableau PostgreSQL (`text[]`) — permet de stocker plusieurs URLs de fichiers par rapport.
- Le champ `score` (1-5) est prévu pour un futur affichage graphique de progression.
