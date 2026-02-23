# Dependencies

```
@optave/codegraph@2.0.0 H:\Vscode\codegraph
├─┬ @biomejs/biome@2.4.4
│ ├── UNMET OPTIONAL DEPENDENCY @biomejs/cli-darwin-arm64@2.4.4
│ ├── UNMET OPTIONAL DEPENDENCY @biomejs/cli-darwin-x64@2.4.4
│ ├── UNMET OPTIONAL DEPENDENCY @biomejs/cli-linux-arm64-musl@2.4.4
│ ├── UNMET OPTIONAL DEPENDENCY @biomejs/cli-linux-arm64@2.4.4
│ ├── UNMET OPTIONAL DEPENDENCY @biomejs/cli-linux-x64-musl@2.4.4
│ ├── UNMET OPTIONAL DEPENDENCY @biomejs/cli-linux-x64@2.4.4
│ ├── UNMET OPTIONAL DEPENDENCY @biomejs/cli-win32-arm64@2.4.4
│ └── @biomejs/cli-win32-x64@2.4.4
├─┬ @commitlint/cli@19.8.1
│ ├─┬ @commitlint/format@19.8.1
│ │ ├── @commitlint/types@19.8.1 deduped
│ │ └── chalk@5.6.2
│ ├─┬ @commitlint/lint@19.8.1
│ │ ├─┬ @commitlint/is-ignored@19.8.1
│ │ │ ├── @commitlint/types@19.8.1 deduped
│ │ │ └── semver@7.7.4 deduped
│ │ ├─┬ @commitlint/parse@19.8.1
│ │ │ ├── @commitlint/types@19.8.1 deduped
│ │ │ ├─┬ conventional-changelog-angular@7.0.0
│ │ │ │ └── compare-func@2.0.0 deduped
│ │ │ └─┬ conventional-commits-parser@5.0.0
│ │ │   ├─┬ is-text-path@2.0.0
│ │ │   │ └── text-extensions@2.4.0
│ │ │   ├── JSONStream@1.3.5 deduped
│ │ │   ├── meow@12.1.1
│ │ │   └── split2@4.2.0 deduped
│ │ ├─┬ @commitlint/rules@19.8.1
│ │ │ ├─┬ @commitlint/ensure@19.8.1
│ │ │ │ ├── @commitlint/types@19.8.1 deduped
│ │ │ │ ├── lodash.camelcase@4.3.0
│ │ │ │ ├── lodash.kebabcase@4.1.1
│ │ │ │ ├── lodash.snakecase@4.1.1
│ │ │ │ ├── lodash.startcase@4.4.0
│ │ │ │ └── lodash.upperfirst@4.3.1
│ │ │ ├── @commitlint/message@19.8.1
│ │ │ ├── @commitlint/to-lines@19.8.1
│ │ │ └── @commitlint/types@19.8.1 deduped
│ │ └── @commitlint/types@19.8.1 deduped
│ ├─┬ @commitlint/load@19.8.1
│ │ ├─┬ @commitlint/config-validator@19.8.1
│ │ │ ├── @commitlint/types@19.8.1 deduped
│ │ │ └── ajv@8.18.0 deduped
│ │ ├── @commitlint/execute-rule@19.8.1
│ │ ├─┬ @commitlint/resolve-extends@19.8.1
│ │ │ ├── @commitlint/config-validator@19.8.1 deduped
│ │ │ ├── @commitlint/types@19.8.1 deduped
│ │ │ ├─┬ global-directory@4.0.1
│ │ │ │ └── ini@4.1.1
│ │ │ ├── import-meta-resolve@4.2.0
│ │ │ ├── lodash.mergewith@4.6.2
│ │ │ └── resolve-from@5.0.0
│ │ ├── @commitlint/types@19.8.1 deduped
│ │ ├── chalk@5.6.2 deduped
│ │ ├─┬ cosmiconfig-typescript-loader@6.2.0
│ │ │ ├── @types/node@25.3.0 deduped
│ │ │ ├── cosmiconfig@9.0.0 deduped
│ │ │ ├── jiti@2.6.1 deduped
│ │ │ └── typescript@5.9.3
│ │ ├─┬ cosmiconfig@9.0.0
│ │ │ ├── env-paths@2.2.1
│ │ │ ├─┬ import-fresh@3.3.1
│ │ │ │ ├─┬ parent-module@1.0.1
│ │ │ │ │ └── callsites@3.1.0
│ │ │ │ └── resolve-from@4.0.0
│ │ │ ├─┬ js-yaml@4.1.1
│ │ │ │ └── argparse@2.0.1
│ │ │ ├─┬ parse-json@5.2.0
│ │ │ │ ├─┬ @babel/code-frame@7.29.0
│ │ │ │ │ ├── @babel/helper-validator-identifier@7.28.5 deduped
│ │ │ │ │ ├── js-tokens@4.0.0
│ │ │ │ │ └── picocolors@1.1.1 deduped
│ │ │ │ ├─┬ error-ex@1.3.4
│ │ │ │ │ └── is-arrayish@0.2.1
│ │ │ │ ├── json-parse-even-better-errors@2.3.1
│ │ │ │ └── lines-and-columns@1.2.4
│ │ │ └── typescript@5.9.3 deduped
│ │ ├── lodash.isplainobject@4.0.6
│ │ ├── lodash.merge@4.6.2
│ │ └── lodash.uniq@4.5.0
│ ├─┬ @commitlint/read@19.8.1
│ │ ├─┬ @commitlint/top-level@19.8.1
│ │ │ └─┬ find-up@7.0.0
│ │ │   ├─┬ locate-path@7.2.0
│ │ │   │ └─┬ p-locate@6.0.0
│ │ │   │   └─┬ p-limit@4.0.0
│ │ │   │     └── yocto-queue@1.2.2
│ │ │   ├── path-exists@5.0.0
│ │ │   └── unicorn-magic@0.1.0
│ │ ├── @commitlint/types@19.8.1 deduped
│ │ ├─┬ git-raw-commits@4.0.0
│ │ │ ├── dargs@8.1.0
│ │ │ ├── meow@12.1.1
│ │ │ └── split2@4.2.0
│ │ ├── minimist@1.2.8
│ │ └── tinyexec@1.0.2 deduped
│ ├─┬ @commitlint/types@19.8.1
│ │ ├─┬ @types/conventional-commits-parser@5.0.2
│ │ │ └── @types/node@25.3.0 deduped
│ │ └── chalk@5.6.2 deduped
│ ├── tinyexec@1.0.2
│ └─┬ yargs@17.7.2
│   ├─┬ cliui@8.0.1
│   │ ├── string-width@4.2.3 deduped
│   │ ├─┬ strip-ansi@6.0.1
│   │ │ └── ansi-regex@5.0.1
│   │ └─┬ wrap-ansi@7.0.0
│   │   ├─┬ ansi-styles@4.3.0
│   │   │ └─┬ color-convert@2.0.1
│   │   │   └── color-name@1.1.4
│   │   ├── string-width@4.2.3 deduped
│   │   └── strip-ansi@6.0.1 deduped
│   ├── escalade@3.2.0
│   ├── get-caller-file@2.0.5
│   ├── require-directory@2.1.1
│   ├─┬ string-width@4.2.3
│   │ ├── emoji-regex@8.0.0
│   │ ├── is-fullwidth-code-point@3.0.0
│   │ └── strip-ansi@6.0.1 deduped
│   ├── y18n@5.0.8
│   └── yargs-parser@21.1.1
├─┬ @commitlint/config-conventional@19.8.1
│ ├── @commitlint/types@19.8.1 deduped
│ └─┬ conventional-changelog-conventionalcommits@7.0.2
│   └─┬ compare-func@2.0.0
│     ├── array-ify@1.0.0
│     └─┬ dot-prop@5.3.0
│       └── is-obj@2.0.0
├─┬ @huggingface/transformers@3.8.1
│ ├── @huggingface/jinja@0.5.5
│ ├─┬ onnxruntime-node@1.21.0
│ │ ├─┬ global-agent@3.0.0
│ │ │ ├── boolean@3.2.0
│ │ │ ├── es6-error@4.1.1
│ │ │ ├─┬ matcher@3.0.0
│ │ │ │ └── escape-string-regexp@4.0.0
│ │ │ ├─┬ roarr@2.15.4
│ │ │ │ ├── boolean@3.2.0 deduped
│ │ │ │ ├── detect-node@2.1.0
│ │ │ │ ├─┬ globalthis@1.0.4
│ │ │ │ │ ├─┬ define-properties@1.2.1
│ │ │ │ │ │ ├─┬ define-data-property@1.1.4
│ │ │ │ │ │ │ ├── es-define-property@1.0.1 deduped
│ │ │ │ │ │ │ ├── es-errors@1.3.0 deduped
│ │ │ │ │ │ │ └── gopd@1.2.0 deduped
│ │ │ │ │ │ ├─┬ has-property-descriptors@1.0.2
│ │ │ │ │ │ │ └── es-define-property@1.0.1 deduped
│ │ │ │ │ │ └── object-keys@1.1.1
│ │ │ │ │ └── gopd@1.2.0
│ │ │ │ ├── json-stringify-safe@5.0.1
│ │ │ │ ├── semver-compare@1.0.0
│ │ │ │ └── sprintf-js@1.1.3
│ │ │ ├── semver@7.7.4 deduped
│ │ │ └─┬ serialize-error@7.0.1
│ │ │   └── type-fest@0.13.1
│ │ ├── onnxruntime-common@1.21.0
│ │ └─┬ tar@7.5.9
│ │   ├─┬ @isaacs/fs-minipass@4.0.1
│ │   │ └── minipass@7.1.3 deduped
│ │   ├── chownr@3.0.0
│ │   ├── minipass@7.1.3
│ │   ├─┬ minizlib@3.1.0
│ │   │ └── minipass@7.1.3 deduped
│ │   └── yallist@5.0.0
│ ├─┬ onnxruntime-web@1.22.0-dev.20250409-89f8206ba4
│ │ ├── flatbuffers@25.9.23
│ │ ├── guid-typescript@1.0.9
│ │ ├── long@5.3.2
│ │ ├── onnxruntime-common@1.22.0-dev.20250409-89f8206ba4
│ │ ├── platform@1.3.6
│ │ └─┬ protobufjs@7.5.4
│ │   ├── @protobufjs/aspromise@1.1.2
│ │   ├── @protobufjs/base64@1.1.2
│ │   ├── @protobufjs/codegen@2.0.4
│ │   ├── @protobufjs/eventemitter@1.1.0
│ │   ├─┬ @protobufjs/fetch@1.1.0
│ │   │ ├── @protobufjs/aspromise@1.1.2 deduped
│ │   │ └── @protobufjs/inquire@1.1.0 deduped
│ │   ├── @protobufjs/float@1.0.2
│ │   ├── @protobufjs/inquire@1.1.0
│ │   ├── @protobufjs/path@1.1.2
│ │   ├── @protobufjs/pool@1.1.0
│ │   ├── @protobufjs/utf8@1.1.0
│ │   ├── @types/node@25.3.0 deduped
│ │   └── long@5.3.2 deduped
│ └─┬ sharp@0.34.5
│   ├── @img/colour@1.0.0
│   ├── UNMET OPTIONAL DEPENDENCY @img/sharp-darwin-arm64@0.34.5
│   ├── UNMET OPTIONAL DEPENDENCY @img/sharp-darwin-x64@0.34.5
│   ├── UNMET OPTIONAL DEPENDENCY @img/sharp-libvips-darwin-arm64@1.2.4
│   ├── UNMET OPTIONAL DEPENDENCY @img/sharp-libvips-darwin-x64@1.2.4
│   ├── UNMET OPTIONAL DEPENDENCY @img/sharp-libvips-linux-arm@1.2.4
│   ├── UNMET OPTIONAL DEPENDENCY @img/sharp-libvips-linux-arm64@1.2.4
│   ├── UNMET OPTIONAL DEPENDENCY @img/sharp-libvips-linux-ppc64@1.2.4
│   ├── UNMET OPTIONAL DEPENDENCY @img/sharp-libvips-linux-riscv64@1.2.4
│   ├── UNMET OPTIONAL DEPENDENCY @img/sharp-libvips-linux-s390x@1.2.4
│   ├── UNMET OPTIONAL DEPENDENCY @img/sharp-libvips-linux-x64@1.2.4
│   ├── UNMET OPTIONAL DEPENDENCY @img/sharp-libvips-linuxmusl-arm64@1.2.4
│   ├── UNMET OPTIONAL DEPENDENCY @img/sharp-libvips-linuxmusl-x64@1.2.4
│   ├── UNMET OPTIONAL DEPENDENCY @img/sharp-linux-arm@0.34.5
│   ├── UNMET OPTIONAL DEPENDENCY @img/sharp-linux-arm64@0.34.5
│   ├── UNMET OPTIONAL DEPENDENCY @img/sharp-linux-ppc64@0.34.5
│   ├── UNMET OPTIONAL DEPENDENCY @img/sharp-linux-riscv64@0.34.5
│   ├── UNMET OPTIONAL DEPENDENCY @img/sharp-linux-s390x@0.34.5
│   ├── UNMET OPTIONAL DEPENDENCY @img/sharp-linux-x64@0.34.5
│   ├── UNMET OPTIONAL DEPENDENCY @img/sharp-linuxmusl-arm64@0.34.5
│   ├── UNMET OPTIONAL DEPENDENCY @img/sharp-linuxmusl-x64@0.34.5
│   ├── UNMET OPTIONAL DEPENDENCY @img/sharp-wasm32@0.34.5
│   ├── UNMET OPTIONAL DEPENDENCY @img/sharp-win32-arm64@0.34.5
│   ├── UNMET OPTIONAL DEPENDENCY @img/sharp-win32-ia32@0.34.5
│   ├── @img/sharp-win32-x64@0.34.5
│   ├── detect-libc@2.1.2
│   └── semver@7.7.4 deduped
├─┬ @modelcontextprotocol/sdk@1.26.0
│ ├── UNMET OPTIONAL DEPENDENCY @cfworker/json-schema@^4.1.1
│ ├─┬ @hono/node-server@1.19.9
│ │ └── hono@4.12.0 deduped
│ ├─┬ ajv-formats@3.0.1
│ │ └── ajv@8.18.0 deduped
│ ├─┬ ajv@8.18.0
│ │ ├── fast-deep-equal@3.1.3
│ │ ├── fast-uri@3.1.0
│ │ ├── json-schema-traverse@1.0.0
│ │ └── require-from-string@2.0.2
│ ├── content-type@1.0.5
│ ├─┬ cors@2.8.6
│ │ ├── object-assign@4.1.1
│ │ └── vary@1.1.2
│ ├─┬ cross-spawn@7.0.6
│ │ ├── path-key@3.1.1
│ │ ├─┬ shebang-command@2.0.0
│ │ │ └── shebang-regex@3.0.0
│ │ └─┬ which@2.0.2
│ │   └── isexe@2.0.0
│ ├── eventsource-parser@3.0.6
│ ├─┬ eventsource@3.0.7
│ │ └── eventsource-parser@3.0.6 deduped
│ ├─┬ express-rate-limit@8.2.1
│ │ ├── express@5.2.1 deduped
│ │ └── ip-address@10.0.1
│ ├─┬ express@5.2.1
│ │ ├─┬ accepts@2.0.0
│ │ │ ├── mime-types@3.0.2 deduped
│ │ │ └── negotiator@1.0.0
│ │ ├─┬ body-parser@2.2.2
│ │ │ ├── bytes@3.1.2 deduped
│ │ │ ├── content-type@1.0.5 deduped
│ │ │ ├── debug@4.4.3 deduped
│ │ │ ├── http-errors@2.0.1 deduped
│ │ │ ├── iconv-lite@0.7.2 deduped
│ │ │ ├── on-finished@2.4.1 deduped
│ │ │ ├── qs@6.15.0 deduped
│ │ │ ├── raw-body@3.0.2 deduped
│ │ │ └── type-is@2.0.1 deduped
│ │ ├── content-disposition@1.0.1
│ │ ├── content-type@1.0.5 deduped
│ │ ├── cookie-signature@1.2.2
│ │ ├── cookie@0.7.2
│ │ ├─┬ debug@4.4.3
│ │ │ └── ms@2.1.3
│ │ ├── depd@2.0.0
│ │ ├── encodeurl@2.0.0
│ │ ├── escape-html@1.0.3
│ │ ├── etag@1.8.1
│ │ ├─┬ finalhandler@2.1.1
│ │ │ ├── debug@4.4.3 deduped
│ │ │ ├── encodeurl@2.0.0 deduped
│ │ │ ├── escape-html@1.0.3 deduped
│ │ │ ├── on-finished@2.4.1 deduped
│ │ │ ├── parseurl@1.3.3 deduped
│ │ │ └── statuses@2.0.2 deduped
│ │ ├── fresh@2.0.0
│ │ ├─┬ http-errors@2.0.1
│ │ │ ├── depd@2.0.0 deduped
│ │ │ ├── inherits@2.0.4
│ │ │ ├── setprototypeof@1.2.0
│ │ │ ├── statuses@2.0.2 deduped
│ │ │ └── toidentifier@1.0.1
│ │ ├── merge-descriptors@2.0.0
│ │ ├─┬ mime-types@3.0.2
│ │ │ └── mime-db@1.54.0
│ │ ├─┬ on-finished@2.4.1
│ │ │ └── ee-first@1.1.1
│ │ ├─┬ once@1.4.0
│ │ │ └── wrappy@1.0.2
│ │ ├── parseurl@1.3.3
│ │ ├─┬ proxy-addr@2.0.7
│ │ │ ├── forwarded@0.2.0
│ │ │ └── ipaddr.js@1.9.1
│ │ ├─┬ qs@6.15.0
│ │ │ └─┬ side-channel@1.1.0
│ │ │   ├── es-errors@1.3.0
│ │ │   ├── object-inspect@1.13.4
│ │ │   ├─┬ side-channel-list@1.0.0
│ │ │   │ ├── es-errors@1.3.0 deduped
│ │ │   │ └── object-inspect@1.13.4 deduped
│ │ │   ├─┬ side-channel-map@1.0.1
│ │ │   │ ├─┬ call-bound@1.0.4
│ │ │   │ │ ├─┬ call-bind-apply-helpers@1.0.2
│ │ │   │ │ │ ├── es-errors@1.3.0 deduped
│ │ │   │ │ │ └── function-bind@1.1.2 deduped
│ │ │   │ │ └── get-intrinsic@1.3.0 deduped
│ │ │   │ ├── es-errors@1.3.0 deduped
│ │ │   │ ├─┬ get-intrinsic@1.3.0
│ │ │   │ │ ├── call-bind-apply-helpers@1.0.2 deduped
│ │ │   │ │ ├── es-define-property@1.0.1
│ │ │   │ │ ├── es-errors@1.3.0 deduped
│ │ │   │ │ ├─┬ es-object-atoms@1.1.1
│ │ │   │ │ │ └── es-errors@1.3.0 deduped
│ │ │   │ │ ├── function-bind@1.1.2
│ │ │   │ │ ├─┬ get-proto@1.0.1
│ │ │   │ │ │ ├─┬ dunder-proto@1.0.1
│ │ │   │ │ │ │ ├── call-bind-apply-helpers@1.0.2 deduped
│ │ │   │ │ │ │ ├── es-errors@1.3.0 deduped
│ │ │   │ │ │ │ └── gopd@1.2.0 deduped
│ │ │   │ │ │ └── es-object-atoms@1.1.1 deduped
│ │ │   │ │ ├── gopd@1.2.0 deduped
│ │ │   │ │ ├── has-symbols@1.1.0
│ │ │   │ │ ├── hasown@2.0.2 deduped
│ │ │   │ │ └── math-intrinsics@1.1.0
│ │ │   │ └── object-inspect@1.13.4 deduped
│ │ │   └─┬ side-channel-weakmap@1.0.2
│ │ │     ├── call-bound@1.0.4 deduped
│ │ │     ├── es-errors@1.3.0 deduped
│ │ │     ├── get-intrinsic@1.3.0 deduped
│ │ │     ├── object-inspect@1.13.4 deduped
│ │ │     └── side-channel-map@1.0.1 deduped
│ │ ├── range-parser@1.2.1
│ │ ├─┬ router@2.2.0
│ │ │ ├── debug@4.4.3 deduped
│ │ │ ├── depd@2.0.0 deduped
│ │ │ ├── is-promise@4.0.0
│ │ │ ├── parseurl@1.3.3 deduped
│ │ │ └── path-to-regexp@8.3.0
│ │ ├─┬ send@1.2.1
│ │ │ ├── debug@4.4.3 deduped
│ │ │ ├── encodeurl@2.0.0 deduped
│ │ │ ├── escape-html@1.0.3 deduped
│ │ │ ├── etag@1.8.1 deduped
│ │ │ ├── fresh@2.0.0 deduped
│ │ │ ├── http-errors@2.0.1 deduped
│ │ │ ├── mime-types@3.0.2 deduped
│ │ │ ├── ms@2.1.3 deduped
│ │ │ ├── on-finished@2.4.1 deduped
│ │ │ ├── range-parser@1.2.1 deduped
│ │ │ └── statuses@2.0.2 deduped
│ │ ├─┬ serve-static@2.2.1
│ │ │ ├── encodeurl@2.0.0 deduped
│ │ │ ├── escape-html@1.0.3 deduped
│ │ │ ├── parseurl@1.3.3 deduped
│ │ │ └── send@1.2.1 deduped
│ │ ├── statuses@2.0.2
│ │ ├─┬ type-is@2.0.1
│ │ │ ├── content-type@1.0.5 deduped
│ │ │ ├── media-typer@1.1.0
│ │ │ └── mime-types@3.0.2 deduped
│ │ └── vary@1.1.2 deduped
│ ├── hono@4.12.0
│ ├── jose@6.1.3
│ ├── json-schema-typed@8.0.2
│ ├── pkce-challenge@5.0.1
│ ├─┬ raw-body@3.0.2
│ │ ├── bytes@3.1.2
│ │ ├── http-errors@2.0.1 deduped
│ │ ├─┬ iconv-lite@0.7.2
│ │ │ └── safer-buffer@2.1.2
│ │ └── unpipe@1.0.0
│ ├─┬ zod-to-json-schema@3.25.1
│ │ └── zod@4.3.6 deduped
│ └── zod@4.3.6
├── UNMET OPTIONAL DEPENDENCY @optave/codegraph-darwin-arm64@2.0.0
├── UNMET OPTIONAL DEPENDENCY @optave/codegraph-darwin-x64@2.0.0
├── UNMET OPTIONAL DEPENDENCY @optave/codegraph-linux-x64-gnu@2.0.0
├── UNMET OPTIONAL DEPENDENCY @optave/codegraph-win32-x64-msvc@2.0.0
├─┬ @tree-sitter-grammars/tree-sitter-hcl@1.2.0
│ ├── node-addon-api@8.5.0
│ ├── node-gyp-build@4.8.4
│ └── UNMET OPTIONAL DEPENDENCY tree-sitter@^0.25.0
├─┬ @vitest/coverage-v8@4.0.18
│ ├── @bcoe/v8-coverage@1.0.2
│ ├── UNMET OPTIONAL DEPENDENCY @vitest/browser@4.0.18
│ ├─┬ @vitest/utils@4.0.18
│ │ ├── @vitest/pretty-format@4.0.18 deduped
│ │ └── tinyrainbow@3.0.3 deduped
│ ├─┬ ast-v8-to-istanbul@0.3.11
│ │ ├─┬ @jridgewell/trace-mapping@0.3.31
│ │ │ ├── @jridgewell/resolve-uri@3.1.2
│ │ │ └── @jridgewell/sourcemap-codec@1.5.5 deduped
│ │ ├─┬ estree-walker@3.0.3
│ │ │ └── @types/estree@1.0.8
│ │ └── js-tokens@10.0.0
│ ├── istanbul-lib-coverage@3.2.2
│ ├─┬ istanbul-lib-report@3.0.1
│ │ ├── istanbul-lib-coverage@3.2.2 deduped
│ │ ├─┬ make-dir@4.0.0
│ │ │ └── semver@7.7.4 deduped
│ │ └─┬ supports-color@7.2.0
│ │   └── has-flag@4.0.0
│ ├─┬ istanbul-reports@3.2.0
│ │ ├── html-escaper@2.0.2
│ │ └── istanbul-lib-report@3.0.1 deduped
│ ├─┬ magicast@0.5.2
│ │ ├─┬ @babel/parser@7.29.0
│ │ │ └── @babel/types@7.29.0 deduped
│ │ ├─┬ @babel/types@7.29.0
│ │ │ ├── @babel/helper-string-parser@7.27.1
│ │ │ └── @babel/helper-validator-identifier@7.28.5
│ │ └── source-map-js@1.2.1
│ ├── obug@2.1.1
│ ├── std-env@3.10.0
│ ├── tinyrainbow@3.0.3
│ └── vitest@4.0.18 deduped
├─┬ better-sqlite3@12.6.2
│ ├─┬ bindings@1.5.0
│ │ └── file-uri-to-path@1.0.0
│ └─┬ prebuild-install@7.1.3
│   ├── detect-libc@2.1.2 deduped
│   ├── expand-template@2.0.3
│   ├── github-from-package@0.0.0
│   ├── minimist@1.2.8 deduped
│   ├── mkdirp-classic@0.5.3
│   ├── napi-build-utils@2.0.0
│   ├─┬ node-abi@3.87.0
│   │ └── semver@7.7.4 deduped
│   ├─┬ pump@3.0.3
│   │ ├─┬ end-of-stream@1.4.5
│   │ │ └── once@1.4.0 deduped
│   │ └── once@1.4.0 deduped
│   ├─┬ rc@1.2.8
│   │ ├── deep-extend@0.6.0
│   │ ├── ini@1.3.8
│   │ ├── minimist@1.2.8 deduped
│   │ └── strip-json-comments@2.0.1
│   ├─┬ simple-get@4.0.1
│   │ ├─┬ decompress-response@6.0.0
│   │ │ └── mimic-response@3.1.0
│   │ ├── once@1.4.0 deduped
│   │ └── simple-concat@1.0.1
│   ├─┬ tar-fs@2.1.4
│   │ ├── chownr@1.1.4
│   │ ├── mkdirp-classic@0.5.3 deduped
│   │ ├── pump@3.0.3 deduped
│   │ └─┬ tar-stream@2.2.0
│   │   ├─┬ bl@4.1.0
│   │   │ ├─┬ buffer@5.7.1
│   │   │ │ ├── base64-js@1.5.1
│   │   │ │ └── ieee754@1.2.1
│   │   │ ├── inherits@2.0.4 deduped
│   │   │ └── readable-stream@3.6.2 deduped
│   │   ├── end-of-stream@1.4.5 deduped
│   │   ├── fs-constants@1.0.0
│   │   ├── inherits@2.0.4 deduped
│   │   └── readable-stream@3.6.2 deduped
│   └─┬ tunnel-agent@0.6.0
│     └── safe-buffer@5.2.1
├── commander@14.0.3
├─┬ commit-and-tag-version@12.6.1
│ ├─┬ chalk@2.4.2
│ │ ├─┬ ansi-styles@3.2.1
│ │ │ └─┬ color-convert@1.9.3
│ │ │   └── color-name@1.1.3
│ │ ├── escape-string-regexp@1.0.5
│ │ └─┬ supports-color@5.5.0
│ │   └── has-flag@3.0.0
│ ├── conventional-changelog-config-spec@2.1.0
│ ├─┬ conventional-changelog-conventionalcommits@6.1.0
│ │ └── compare-func@2.0.0 deduped
│ ├─┬ conventional-changelog@4.0.0
│ │ ├─┬ conventional-changelog-angular@6.0.0
│ │ │ └── compare-func@2.0.0 deduped
│ │ ├── conventional-changelog-atom@3.0.0
│ │ ├── conventional-changelog-codemirror@3.0.0
│ │ ├─┬ conventional-changelog-conventionalcommits@6.1.0
│ │ │ └── compare-func@2.0.0 deduped
│ │ ├─┬ conventional-changelog-core@5.0.2
│ │ │ ├── add-stream@1.0.0
│ │ │ ├─┬ conventional-changelog-writer@6.0.1
│ │ │ │ ├── conventional-commits-filter@3.0.0 deduped
│ │ │ │ ├── dateformat@3.0.3 deduped
│ │ │ │ ├─┬ handlebars@4.7.8
│ │ │ │ │ ├── minimist@1.2.8 deduped
│ │ │ │ │ ├── neo-async@2.6.2
│ │ │ │ │ ├── source-map@0.6.1
│ │ │ │ │ ├── uglify-js@3.19.3
│ │ │ │ │ └── wordwrap@1.0.0
│ │ │ │ ├── json-stringify-safe@5.0.1 deduped
│ │ │ │ ├── meow@8.1.2 deduped
│ │ │ │ ├── semver@7.7.4 deduped
│ │ │ │ └─┬ split@1.0.1
│ │ │ │   └── through@2.3.8 deduped
│ │ │ ├─┬ conventional-commits-parser@4.0.0
│ │ │ │ ├─┬ is-text-path@1.0.1
│ │ │ │ │ └── text-extensions@1.9.0
│ │ │ │ ├── JSONStream@1.3.5 deduped
│ │ │ │ ├── meow@8.1.2 deduped
│ │ │ │ └─┬ split2@3.2.2
│ │ │ │   └── readable-stream@3.6.2 deduped
│ │ │ ├── dateformat@3.0.3
│ │ │ ├─┬ get-pkg-repo@4.2.1
│ │ │ │ ├── @hutson/parse-repository-url@3.0.2
│ │ │ │ ├─┬ hosted-git-info@4.1.0
│ │ │ │ │ └─┬ lru-cache@6.0.0
│ │ │ │ │   └── yallist@4.0.0
│ │ │ │ ├─┬ through2@2.0.5
│ │ │ │ │ ├─┬ readable-stream@2.3.8
│ │ │ │ │ │ ├── core-util-is@1.0.3
│ │ │ │ │ │ ├── inherits@2.0.4 deduped
│ │ │ │ │ │ ├── isarray@1.0.0
│ │ │ │ │ │ ├── process-nextick-args@2.0.1
│ │ │ │ │ │ ├── safe-buffer@5.1.2
│ │ │ │ │ │ ├─┬ string_decoder@1.1.1
│ │ │ │ │ │ │ └── safe-buffer@5.1.2 deduped
│ │ │ │ │ │ └── util-deprecate@1.0.2 deduped
│ │ │ │ │ └── xtend@4.0.2
│ │ │ │ └─┬ yargs@16.2.0
│ │ │ │   ├─┬ cliui@7.0.4
│ │ │ │   │ ├── string-width@4.2.3 deduped
│ │ │ │   │ ├── strip-ansi@6.0.1 deduped
│ │ │ │   │ └── wrap-ansi@7.0.0 deduped
│ │ │ │   ├── escalade@3.2.0 deduped
│ │ │ │   ├── get-caller-file@2.0.5 deduped
│ │ │ │   ├── require-directory@2.1.1 deduped
│ │ │ │   ├── string-width@4.2.3 deduped
│ │ │ │   ├── y18n@5.0.8 deduped
│ │ │ │   └── yargs-parser@20.2.9 deduped
│ │ │ ├─┬ git-raw-commits@3.0.0
│ │ │ │ ├── dargs@7.0.0
│ │ │ │ ├── meow@8.1.2 deduped
│ │ │ │ └── split2@3.2.2 deduped
│ │ │ ├─┬ git-remote-origin-url@2.0.0
│ │ │ │ ├─┬ gitconfiglocal@1.0.0
│ │ │ │ │ └── ini@1.3.8 deduped
│ │ │ │ └── pify@2.3.0
│ │ │ ├── git-semver-tags@5.0.1 deduped
│ │ │ ├─┬ normalize-package-data@3.0.3
│ │ │ │ ├── hosted-git-info@4.1.0 deduped
│ │ │ │ ├─┬ is-core-module@2.16.1
│ │ │ │ │ └─┬ hasown@2.0.2
│ │ │ │ │   └── function-bind@1.1.2 deduped
│ │ │ │ ├── semver@7.7.4 deduped
│ │ │ │ └─┬ validate-npm-package-license@3.0.4
│ │ │ │   ├─┬ spdx-correct@3.2.0
│ │ │ │   │ ├── spdx-expression-parse@3.0.1 deduped
│ │ │ │   │ └── spdx-license-ids@3.0.23
│ │ │ │   └─┬ spdx-expression-parse@3.0.1
│ │ │ │     ├── spdx-exceptions@2.5.0
│ │ │ │     └── spdx-license-ids@3.0.23 deduped
│ │ │ ├─┬ read-pkg-up@3.0.0
│ │ │ │ ├─┬ find-up@2.1.0
│ │ │ │ │ └─┬ locate-path@2.0.0
│ │ │ │ │   ├─┬ p-locate@2.0.0
│ │ │ │ │   │ └─┬ p-limit@1.3.0
│ │ │ │ │   │   └── p-try@1.0.0
│ │ │ │ │   └── path-exists@3.0.0
│ │ │ │ └── read-pkg@3.0.0 deduped
│ │ │ └─┬ read-pkg@3.0.0
│ │ │   ├─┬ load-json-file@4.0.0
│ │ │   │ ├── graceful-fs@4.2.11
│ │ │   │ ├─┬ parse-json@4.0.0
│ │ │   │ │ ├── error-ex@1.3.4 deduped
│ │ │   │ │ └── json-parse-better-errors@1.0.2
│ │ │   │ ├── pify@3.0.0
│ │ │   │ └── strip-bom@3.0.0
│ │ │   ├─┬ normalize-package-data@2.5.0
│ │ │   │ ├── hosted-git-info@2.8.9
│ │ │   │ ├─┬ resolve@1.22.11
│ │ │   │ │ ├── is-core-module@2.16.1 deduped
│ │ │   │ │ ├── path-parse@1.0.7
│ │ │   │ │ └── supports-preserve-symlinks-flag@1.0.0
│ │ │   │ ├── semver@5.7.2
│ │ │   │ └── validate-npm-package-license@3.0.4 deduped
│ │ │   └─┬ path-type@3.0.0
│ │ │     └── pify@3.0.0
│ │ ├── conventional-changelog-ember@3.0.0
│ │ ├── conventional-changelog-eslint@4.0.0
│ │ ├── conventional-changelog-express@3.0.0
│ │ ├── conventional-changelog-jquery@4.0.0
│ │ ├─┬ conventional-changelog-jshint@3.0.0
│ │ │ └── compare-func@2.0.0 deduped
│ │ └── conventional-changelog-preset-loader@3.0.0
│ ├─┬ conventional-recommended-bump@7.0.1
│ │ ├─┬ concat-stream@2.0.0
│ │ │ ├── buffer-from@1.1.2
│ │ │ ├── inherits@2.0.4 deduped
│ │ │ ├─┬ readable-stream@3.6.2
│ │ │ │ ├── inherits@2.0.4 deduped
│ │ │ │ ├─┬ string_decoder@1.3.0
│ │ │ │ │ └── safe-buffer@5.2.1 deduped
│ │ │ │ └── util-deprecate@1.0.2
│ │ │ └── typedarray@0.0.6
│ │ ├── conventional-changelog-preset-loader@3.0.0 deduped
│ │ ├─┬ conventional-commits-filter@3.0.0
│ │ │ ├── lodash.ismatch@4.4.0
│ │ │ └── modify-values@1.0.1
│ │ ├─┬ conventional-commits-parser@4.0.0
│ │ │ ├─┬ is-text-path@1.0.1
│ │ │ │ └── text-extensions@1.9.0
│ │ │ ├─┬ JSONStream@1.3.5
│ │ │ │ ├── jsonparse@1.3.1
│ │ │ │ └── through@2.3.8
│ │ │ ├── meow@8.1.2 deduped
│ │ │ └─┬ split2@3.2.2
│ │ │   └── readable-stream@3.6.2 deduped
│ │ ├─┬ git-raw-commits@3.0.0
│ │ │ ├── dargs@7.0.0
│ │ │ ├── meow@8.1.2 deduped
│ │ │ └── split2@3.2.2 deduped
│ │ ├── git-semver-tags@5.0.1 deduped
│ │ └─┬ meow@8.1.2
│ │   ├── @types/minimist@1.2.5
│ │   ├─┬ camelcase-keys@6.2.2
│ │   │ ├── camelcase@5.3.1
│ │   │ ├── map-obj@4.3.0
│ │   │ └── quick-lru@4.0.1
│ │   ├─┬ decamelize-keys@1.1.1
│ │   │ ├── decamelize@1.2.0
│ │   │ └── map-obj@1.0.1
│ │   ├── hard-rejection@2.1.0
│ │   ├─┬ minimist-options@4.1.0
│ │   │ ├── arrify@1.0.1
│ │   │ ├── is-plain-obj@1.1.0
│ │   │ └── kind-of@6.0.3
│ │   ├── normalize-package-data@3.0.3 deduped
│ │   ├─┬ read-pkg-up@7.0.1
│ │   │ ├─┬ find-up@4.1.0
│ │   │ │ ├─┬ locate-path@5.0.0
│ │   │ │ │ └─┬ p-locate@4.1.0
│ │   │ │ │   └─┬ p-limit@2.3.0
│ │   │ │ │     └── p-try@2.2.0 deduped
│ │   │ │ └── path-exists@4.0.0
│ │   │ ├─┬ read-pkg@5.2.0
│ │   │ │ ├── @types/normalize-package-data@2.4.4
│ │   │ │ ├─┬ normalize-package-data@2.5.0
│ │   │ │ │ ├── hosted-git-info@2.8.9
│ │   │ │ │ ├── resolve@1.22.11 deduped
│ │   │ │ │ ├── semver@5.7.2
│ │   │ │ │ └── validate-npm-package-license@3.0.4 deduped
│ │   │ │ ├── parse-json@5.2.0 deduped
│ │   │ │ └── type-fest@0.6.0
│ │   │ └── type-fest@0.8.1
│ │   ├─┬ redent@3.0.0
│ │   │ ├── indent-string@4.0.0
│ │   │ └─┬ strip-indent@3.0.0
│ │   │   └── min-indent@1.0.1
│ │   ├── trim-newlines@3.0.1
│ │   ├── type-fest@0.18.1
│ │   └── yargs-parser@20.2.9
│ ├── detect-indent@6.1.0
│ ├── detect-newline@3.1.0
│ ├─┬ dotgitignore@2.1.0
│ │ ├─┬ find-up@3.0.0
│ │ │ └─┬ locate-path@3.0.0
│ │ │   ├─┬ p-locate@3.0.0
│ │ │   │ └─┬ p-limit@2.3.0
│ │ │   │   └── p-try@2.2.0
│ │ │   └── path-exists@3.0.0
│ │ └─┬ minimatch@3.1.3
│ │   └─┬ brace-expansion@1.1.12
│ │     ├── balanced-match@1.0.2
│ │     └── concat-map@0.0.1
│ ├─┬ fast-xml-parser@5.3.7
│ │ └── strnum@2.1.2
│ ├─┬ figures@3.2.0
│ │ └── escape-string-regexp@1.0.5
│ ├─┬ find-up@5.0.0
│ │ ├─┬ locate-path@6.0.0
│ │ │ └─┬ p-locate@5.0.0
│ │ │   └─┬ p-limit@3.1.0
│ │ │     └── yocto-queue@0.1.0
│ │ └── path-exists@4.0.0
│ ├─┬ git-semver-tags@5.0.1
│ │ ├── meow@8.1.2 deduped
│ │ └── semver@7.7.4 deduped
│ ├── semver@7.7.4
│ ├── yaml@2.8.2
│ └── yargs@17.7.2 deduped
├── husky@9.1.7
├─┬ tree-sitter-c-sharp@0.23.1
│ ├── node-addon-api@8.5.0 deduped
│ ├── node-gyp-build@4.8.4 deduped
│ └── UNMET OPTIONAL DEPENDENCY tree-sitter@^0.21.1
├── tree-sitter-cli@0.26.5
├─┬ tree-sitter-go@0.23.4
│ ├── node-addon-api@8.5.0 deduped
│ ├── node-gyp-build@4.8.4 deduped
│ └── UNMET OPTIONAL DEPENDENCY tree-sitter@^0.21.1
├─┬ tree-sitter-java@0.23.5
│ ├── node-addon-api@8.5.0 deduped
│ ├── node-gyp-build@4.8.4 deduped
│ └── UNMET OPTIONAL DEPENDENCY tree-sitter@^0.21.1
├─┬ tree-sitter-javascript@0.25.0
│ ├── node-addon-api@8.5.0 deduped
│ ├── node-gyp-build@4.8.4 deduped
│ └── UNMET OPTIONAL DEPENDENCY tree-sitter@^0.25.0
├─┬ tree-sitter-php@0.24.2
│ ├── node-addon-api@8.5.0 deduped
│ ├── node-gyp-build@4.8.4 deduped
│ └── UNMET OPTIONAL DEPENDENCY tree-sitter@^0.22.4
├─┬ tree-sitter-python@0.25.0
│ ├── node-addon-api@8.5.0 deduped
│ ├── node-gyp-build@4.8.4 deduped
│ └── UNMET OPTIONAL DEPENDENCY tree-sitter@^0.25.0
├─┬ tree-sitter-ruby@0.23.1
│ ├── node-addon-api@8.5.0 deduped
│ ├── node-gyp-build@4.8.4 deduped
│ └── UNMET OPTIONAL DEPENDENCY tree-sitter@^0.21.1
├─┬ tree-sitter-rust@0.24.0
│ ├── node-addon-api@8.5.0 deduped
│ ├── node-gyp-build@4.8.4 deduped
│ └── UNMET OPTIONAL DEPENDENCY tree-sitter@^0.22.1
├─┬ tree-sitter-typescript@0.23.2
│ ├── node-addon-api@8.5.0 deduped
│ ├── node-gyp-build@4.8.4 deduped
│ ├─┬ tree-sitter-javascript@0.23.1
│ │ ├── node-addon-api@8.5.0 deduped
│ │ ├── node-gyp-build@4.8.4 deduped
│ │ └── UNMET OPTIONAL DEPENDENCY tree-sitter@^0.21.1
│ └── UNMET OPTIONAL DEPENDENCY tree-sitter@^0.21.0
├─┬ vitest@4.0.18
│ ├── UNMET OPTIONAL DEPENDENCY @edge-runtime/vm@*
│ ├── UNMET OPTIONAL DEPENDENCY @opentelemetry/api@^1.9.0
│ ├─┬ @types/node@25.3.0
│ │ └── undici-types@7.18.2
│ ├── UNMET OPTIONAL DEPENDENCY @vitest/browser-playwright@4.0.18
│ ├── UNMET OPTIONAL DEPENDENCY @vitest/browser-preview@4.0.18
│ ├── UNMET OPTIONAL DEPENDENCY @vitest/browser-webdriverio@4.0.18
│ ├─┬ @vitest/expect@4.0.18
│ │ ├── @standard-schema/spec@1.1.0
│ │ ├─┬ @types/chai@5.2.3
│ │ │ ├── @types/deep-eql@4.0.2
│ │ │ └── assertion-error@2.0.1
│ │ ├── @vitest/spy@4.0.18 deduped
│ │ ├── @vitest/utils@4.0.18 deduped
│ │ ├── chai@6.2.2
│ │ └── tinyrainbow@3.0.3 deduped
│ ├─┬ @vitest/mocker@4.0.18
│ │ ├── @vitest/spy@4.0.18 deduped
│ │ ├── estree-walker@3.0.3 deduped
│ │ ├── magic-string@0.30.21 deduped
│ │ ├── UNMET OPTIONAL DEPENDENCY msw@^2.4.9
│ │ └── vite@7.3.1 deduped
│ ├─┬ @vitest/pretty-format@4.0.18
│ │ └── tinyrainbow@3.0.3 deduped
│ ├─┬ @vitest/runner@4.0.18
│ │ ├── @vitest/utils@4.0.18 deduped
│ │ └── pathe@2.0.3 deduped
│ ├─┬ @vitest/snapshot@4.0.18
│ │ ├── @vitest/pretty-format@4.0.18 deduped
│ │ ├── magic-string@0.30.21 deduped
│ │ └── pathe@2.0.3 deduped
│ ├── @vitest/spy@4.0.18
│ ├── UNMET OPTIONAL DEPENDENCY @vitest/ui@4.0.18
│ ├── @vitest/utils@4.0.18 deduped
│ ├── es-module-lexer@1.7.0
│ ├── expect-type@1.3.0
│ ├── UNMET OPTIONAL DEPENDENCY happy-dom@*
│ ├── UNMET OPTIONAL DEPENDENCY jsdom@*
│ ├─┬ magic-string@0.30.21
│ │ └── @jridgewell/sourcemap-codec@1.5.5
│ ├── obug@2.1.1 deduped
│ ├── pathe@2.0.3
│ ├── picomatch@4.0.3
│ ├── std-env@3.10.0 deduped
│ ├── tinybench@2.9.0
│ ├── tinyexec@1.0.2 deduped
│ ├─┬ tinyglobby@0.2.15
│ │ ├─┬ fdir@6.5.0
│ │ │ └── picomatch@4.0.3 deduped
│ │ └── picomatch@4.0.3 deduped
│ ├── tinyrainbow@3.0.3 deduped
│ ├─┬ vite@7.3.1
│ │ ├── @types/node@25.3.0 deduped
│ │ ├─┬ esbuild@0.27.3
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @esbuild/aix-ppc64@0.27.3
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @esbuild/android-arm@0.27.3
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @esbuild/android-arm64@0.27.3
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @esbuild/android-x64@0.27.3
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @esbuild/darwin-arm64@0.27.3
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @esbuild/darwin-x64@0.27.3
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @esbuild/freebsd-arm64@0.27.3
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @esbuild/freebsd-x64@0.27.3
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @esbuild/linux-arm@0.27.3
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @esbuild/linux-arm64@0.27.3
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @esbuild/linux-ia32@0.27.3
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @esbuild/linux-loong64@0.27.3
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @esbuild/linux-mips64el@0.27.3
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @esbuild/linux-ppc64@0.27.3
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @esbuild/linux-riscv64@0.27.3
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @esbuild/linux-s390x@0.27.3
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @esbuild/linux-x64@0.27.3
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @esbuild/netbsd-arm64@0.27.3
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @esbuild/netbsd-x64@0.27.3
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @esbuild/openbsd-arm64@0.27.3
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @esbuild/openbsd-x64@0.27.3
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @esbuild/openharmony-arm64@0.27.3
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @esbuild/sunos-x64@0.27.3
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @esbuild/win32-arm64@0.27.3
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @esbuild/win32-ia32@0.27.3
│ │ │ └── @esbuild/win32-x64@0.27.3
│ │ ├── fdir@6.5.0 deduped
│ │ ├── UNMET OPTIONAL DEPENDENCY fsevents@~2.3.3
│ │ ├── jiti@2.6.1
│ │ ├── UNMET OPTIONAL DEPENDENCY less@^4.0.0
│ │ ├── UNMET OPTIONAL DEPENDENCY lightningcss@^1.21.0
│ │ ├── picomatch@4.0.3 deduped
│ │ ├─┬ postcss@8.5.6
│ │ │ ├── nanoid@3.3.11
│ │ │ ├── picocolors@1.1.1
│ │ │ └── source-map-js@1.2.1 deduped
│ │ ├─┬ rollup@4.58.0
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-android-arm-eabi@4.58.0
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-android-arm64@4.58.0
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-darwin-arm64@4.58.0
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-darwin-x64@4.58.0
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-freebsd-arm64@4.58.0
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-freebsd-x64@4.58.0
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-linux-arm-gnueabihf@4.58.0
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-linux-arm-musleabihf@4.58.0
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-linux-arm64-gnu@4.58.0
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-linux-arm64-musl@4.58.0
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-linux-loong64-gnu@4.58.0
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-linux-loong64-musl@4.58.0
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-linux-ppc64-gnu@4.58.0
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-linux-ppc64-musl@4.58.0
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-linux-riscv64-gnu@4.58.0
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-linux-riscv64-musl@4.58.0
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-linux-s390x-gnu@4.58.0
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-linux-x64-gnu@4.58.0
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-linux-x64-musl@4.58.0
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-openbsd-x64@4.58.0
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-openharmony-arm64@4.58.0
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-win32-arm64-msvc@4.58.0
│ │ │ ├── UNMET OPTIONAL DEPENDENCY @rollup/rollup-win32-ia32-msvc@4.58.0
│ │ │ ├── @rollup/rollup-win32-x64-gnu@4.58.0
│ │ │ ├── @rollup/rollup-win32-x64-msvc@4.58.0
│ │ │ ├── @types/estree@1.0.8 deduped
│ │ │ └── UNMET OPTIONAL DEPENDENCY fsevents@~2.3.2
│ │ ├── UNMET OPTIONAL DEPENDENCY sass-embedded@^1.70.0
│ │ ├── UNMET OPTIONAL DEPENDENCY sass@^1.70.0
│ │ ├── UNMET OPTIONAL DEPENDENCY stylus@>=0.54.8
│ │ ├── UNMET OPTIONAL DEPENDENCY sugarss@^5.0.0
│ │ ├── UNMET OPTIONAL DEPENDENCY terser@^5.16.0
│ │ ├── tinyglobby@0.2.15 deduped
│ │ ├── UNMET OPTIONAL DEPENDENCY tsx@^4.8.1
│ │ └── yaml@2.8.2 deduped
│ └─┬ why-is-node-running@2.3.0
│   ├── siginfo@2.0.0
│   └── stackback@0.0.2
└── web-tree-sitter@0.26.5

```
