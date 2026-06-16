# PR Structure Check — evidencia manual

PR de prueba: [#68](https://github.com/alejandroadorjan/VSCodeORT/pull/68) (`feature/pr-structure-check` → `development`).

Capturas en [`images/`](./images/).

## 1. Body vacío → falla

![Check fallido y comentario](./images/01-fail-check.png)

## 2. Secciones completas → pasa

![Check verde](./images/03-pass-check.png)

## 3. Bypass `skip-pr-check`

![Label bypass](./images/05-bypass-label.png)

![Check verde con body vacío](./images/05-bypass-label-2.png)

## 4. Draft → no corre

![Draft omitido](./images/06-draft-skipped.png)

