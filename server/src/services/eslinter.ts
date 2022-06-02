import { Linter } from "eslint";
import { join } from "path";
import { fileURLToPath } from "url";
import { WorkspaceFolder } from "vscode-languageserver";
import { readJSON } from "../utils";

const defaultOptions = {
  extends: "eslint:recommended",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "script",
  },
  env: {
    browser: true,
  },
};

let options: any;

export function createLinterOptions(workspace: WorkspaceFolder) {
  const rootPath = fileURLToPath(workspace.uri);
  options = readJSON(join(rootPath, ".eslintrc.json")) ?? defaultOptions;
}

export function getOptions() {
  return options ?? defaultOptions;
}
