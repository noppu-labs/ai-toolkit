export const INSTALL_LIKE = /install|setup|bootstrap|init/i;
export const DOCS_HEADING = /install|setup|getting started|bootstrap|init/i;
export const REF_ARG = /^[^-\s][^\s]*$/;
export const NPM_HOOKS = [
  "preinstall",
  "install",
  "postinstall",
  "preprepare",
  "prepare",
  "postprepare",
  "prepublish",
  "dependencies",
  "pnpm:devPreinstall",
];
export const COMPOSER_HOOKS = [
  "pre-install-cmd",
  "post-install-cmd",
  "pre-autoload-dump",
  "post-autoload-dump",
  "init",
  "pre-command-run",
  "pre-file-download",
  "pre-operations-exec",
  "pre-package-install",
  "post-package-install",
  "command",
  "pre-package-update",
  "post-package-update",
  "pre-package-uninstall",
  "post-package-uninstall",
  "post-file-download",
];

export const MANAGER_BINARIES = { bundler: "bundle" };

export const MAKE_FILES = ["Makefile", "makefile", "GNUmakefile"];
export const JUST_FILES = ["justfile", "Justfile"];
export const TASK_FILES = ["Taskfile.yml", "Taskfile.yaml"];
export const SCRIPT_FILES = [
  "bin/setup",
  "script/setup",
  "bin/bootstrap",
  "script/bootstrap",
];
export const DOCS_FILES = [
  "README.md",
  "CONTRIBUTING.md",
  "CLAUDE.md",
  "AGENTS.md",
];
