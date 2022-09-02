import * as ts from "typescript";
import { TextDocument } from "vscode-languageserver";

export function getLanguageServiceHost(scriptKind: ts.ScriptKind) {
  const compilerOptions: ts.CompilerOptions = {
    allowNonTsExtensions: true,
    allowJs: true,
    lib: ["lib.es2020.full.d.ts"],
    target: ts.ScriptTarget.Latest,
    moduleResolution: ts.ModuleResolutionKind.Classic,
    experimentalDecorators: false,
  };

  let currentTextDocument = TextDocument.create("init", "javascript", 1, "");
  const jsLanguageService = import("./javascriptLibs").then((libs) => {
    const host: ts.LanguageServiceHost = {
      getCompilationSettings: () => compilerOptions,
      getScriptFileNames: () => [currentTextDocument.uri, "jquery"],
      getScriptKind: (fileName) => {
        if (fileName === currentTextDocument.uri) {
          return scriptKind;
        }
        return fileName.substr(fileName.length - 2) === "ts"
          ? ts.ScriptKind.TS
          : ts.ScriptKind.JS;
      },
      getScriptVersion: (fileName: string) => {
        if (fileName === currentTextDocument.uri) {
          return String(currentTextDocument.version);
        }
        return "1"; // default lib an jquery.d.ts are static
      },
      getScriptSnapshot: (fileName: string) => {
        let text = "";
        if (fileName === currentTextDocument.uri) {
          text = currentTextDocument.getText();
        } else {
          text = libs.loadLibrary(fileName);
        }
        return {
          getText: (start, end) => text.substring(start, end),
          getLength: () => text.length,
          getChangeRange: () => undefined,
        };
      },
      getCurrentDirectory: () => "",
      getDefaultLibFileName: (_options: ts.CompilerOptions) => "es2020.full",
      readFile: (
        path: string,
        _encoding?: string | undefined
      ): string | undefined => {
        if (path === currentTextDocument.uri) {
          return currentTextDocument.getText();
        } else {
          return libs.loadLibrary(path);
        }
      },
      fileExists: (path: string): boolean => {
        if (path === currentTextDocument.uri) {
          return true;
        } else {
          return !!libs.loadLibrary(path);
        }
      },
      directoryExists: (path: string): boolean => {
        // typescript tries to first find libraries in node_modules/@types and node_modules/@typescript
        // there's no node_modules in our setup
        if (path.startsWith("node_modules")) {
          return false;
        }
        return true;
      },
    };
    return ts.createLanguageService(host);
  });
  return {
    async getLanguageService(
      jsDocument: TextDocument
    ): Promise<ts.LanguageService> {
      currentTextDocument = jsDocument;
      return jsLanguageService;
    },
    getCompilationSettings() {
      return compilerOptions;
    },
    dispose() {
      jsLanguageService.then((s) => s.dispose());
    },
  };
}
