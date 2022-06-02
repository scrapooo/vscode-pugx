import ts = require("typescript");
import * as fs from "fs";
import * as path from "path";

import { WorkspaceFolder } from "vscode-languageserver";
import { fileURLToPath } from "url";
import { readdirs, readJSON } from "../utils";

let service: ts.LanguageService;

export function createService(workspace: WorkspaceFolder) {
  const rootPath = fileURLToPath(workspace.uri);
  const config: any = readTsconfig(rootPath);

  service = createLanguageService(config, rootPath);
}

export function getLanguageService() {
  return service;
}

function createLanguageService(
  tsconfig: any,
  rootPath: string
): ts.LanguageService {
  const options: ts.CompilerOptions = {
    ...tsconfig.compilerOptions,
    allowNonTsExtensions: [".pugx"],
  };

  const pugFiles = readdirs(rootPath).filter((a) => a.endsWith(".pugx"));

  const serviceHost: ts.LanguageServiceHost = {
    getScriptFileNames: () => pugFiles,
    getScriptVersion: (fileName) => Math.random().toString(),
    getScriptSnapshot: (fileName) => {
      return ts.ScriptSnapshot.fromString(fs.readFileSync(fileName).toString());
    },
    getCurrentDirectory: () => rootPath,
    getCompilationSettings: () => options,
    getDefaultLibFileName: ts.getDefaultLibFilePath,
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    resolveModuleNames(moduleNames: string[], containingFile: string) {
      return moduleNames.map((name) => {
        const tsResolvedModule = ts.resolveModuleName(
          name,
          containingFile,
          options,
          ts.sys
        ).resolvedModule;
        return tsResolvedModule;
      });
    },
  };
  return ts.createLanguageService(serviceHost, ts.createDocumentRegistry());
}

function readTsconfig(rootPath: string): any {
  const configFile = path.join(rootPath, "tsconfig.json");
  return readJSON(configFile) ?? {};
}
