# Termo de Aceite Fast Track · Solturi

Ferramenta web que preenche o **Termo de Aceite – Orientações Gerais sobre "Fast Track"** da Celesc Distribuição com os dados da **Solicitação de TRT** e junta a **procuração** em um único PDF.

Tudo roda no navegador: os arquivos anexados não são enviados para nenhum servidor.

## Como usar

1. **Solicitação de TRT**: anexe o PDF. A ferramenta lê o texto e preenche o número da UC e o nome do contratante.
2. **Dados do termo**: confira os campos. Dá para corrigir manualmente ou escolher outra opção encontrada no arquivo. Se a TRT citar a potência, aparece um aviso quando ela passa de 7,5 kW.
3. **Procuração**: anexe em PDF, JPG ou PNG. Aceita mais de um arquivo, com ordem ajustável.
4. **Baixar PDF**: gera `Termo-FastTrack_UC-<número>_<NOME>.pdf` com o termo preenchido na primeira página, seguido da procuração.

O campo **Assinatura** fica em branco, para ser assinado depois.

## Publicar no GitHub Pages

Em **Settings → Pages**, escolha **Deploy from a branch**, branch `main` e pasta `/ (root)`. A ferramenta fica disponível em `https://<usuário>.github.io/<repositório>/`.

## Estrutura

```
index.html                 ferramenta pronta (arquivo único, gerado pelo build)
src/
  template.html            interface (HTML, CSS e lógica da página)
  core.js                  leitura da TRT, preenchimento do termo e união dos PDFs
  build.py                 monta o index.html
  assets/
    termo-de-aceite-celesc.pdf   modelo do termo (fontes reduzidas, visual idêntico ao original)
    logo-solturi.jpg
    fonts/                 fontes padrão usadas só na pré-visualização (licenças incluídas)
```

## Alterar a ferramenta

Edite os arquivos em `src/` e gere o `index.html` de novo:

```bash
python3 src/build.py
```

- **Leitura da TRT**: os rótulos procurados ficam em `NAME_LABELS` e `UC_LABELS` no `core.js`. Para um formato novo de TRT, acrescente o rótulo correspondente.
- **Posição do texto no termo**: `FIELDS` no `core.js`, em pontos a partir do topo da página A4. Se a Celesc publicar uma nova versão do termo, troque o PDF em `src/assets/` e confira essas posições.

## Bibliotecas

Carregadas da cdnjs: [pdf-lib 1.17.1](https://pdf-lib.js.org/) (preenchimento e união) e [PDF.js 3.11.174](https://mozilla.github.io/pdf.js/) (leitura do texto e pré-visualização).

## Observação

Procurações com assinatura digital (gov.br) mantêm a assinatura visível nas páginas, mas a validação digital vale só para o arquivo original.
