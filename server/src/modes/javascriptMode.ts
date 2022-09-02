import { EmbeddedRegion, PugDocumentRegions } from "../embeddedSupport";
import {
  getLanguageModelCache,
  LanguageModelCache,
} from "../languageModelCache";
import { Linter } from "eslint";

import { getLanguageServiceHost } from "../services/typescriptLanguageService";

import { CompletionItemData, LanguageMode } from "../languageModes";
import {
  CompletionItem,
  CompletionItemKind,
  CompletionList,
  DiagnosticSeverity,
  FormattingOptions,
  Range,
  TextDocument,
} from "vscode-css-languageservice";
import { format } from "prettier";
import { findTabStr } from "./lessMode";
import * as ts from "typescript";
import { fileURLToPath } from "url";
import { getOptions } from "../services/eslinter";
import { getWordAtText } from "../utils/strings";
import { Position, TextEdit } from "vscode-languageserver";

const languageId = "javascript";
const JS_WORD_REGEX =
  /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g;

export function getJavascriptMode(
  documentRegions: LanguageModelCache<PugDocumentRegions>
): LanguageMode {
  const host = getLanguageServiceHost(ts.ScriptKind.JS);

  return {
    getId() {
      return "javascript";
    },
    doValidation(document: TextDocument) {
      const embeddedDocument = documentRegions
        .get(document)
        .getEmbeddedDocument("javascript");

      const linter = new Linter();

      const text = embeddedDocument.getText();
      const data: Linter.LintMessage[] = linter.verify(text, getOptions());

      return data.map((item) => {
        const ruleId = item.ruleId ? `/${item.ruleId}` : "";
        return {
          severity: toSeverity(item.severity),
          range: Range.create(
            item.line - 1,
            item.column - 1,
            (item.endLine ?? item.line) - 1,
            (item.endColumn ?? item.column) - 1
          ),
          code: item.fix?.text,
          message: `${item.message}(eslint${ruleId})`,
        };
      });
    },
    async doComplete(document: TextDocument, position: Position) {
      const jsDocument = documentRegions
        .get(document)
        .getEmbeddedDocument("javascript");

      const jsLanguageService = await host.getLanguageService(jsDocument);
      const offset = jsDocument.offsetAt(position);
      const completions = jsLanguageService.getCompletionsAtPosition(
        jsDocument.uri,
        offset,
        {
          includeExternalModuleExports: false,
          includeInsertTextCompletions: false,
        }
      );
      if (!completions) {
        return { isIncomplete: false, items: [] };
      }
      const replaceRange = convertRange(
        jsDocument,
        getWordAtText(jsDocument.getText(), offset, JS_WORD_REGEX)
      );
      return {
        isIncomplete: false,
        items: completions.entries.map((entry) => {
          const data: CompletionItemData = {
            languageId,
            uri: document.uri,
            offset: offset,
          };
          return {
            uri: document.uri,
            position: position,
            label: entry.name,
            sortText: entry.sortText,
            kind: convertKind(entry.kind),
            textEdit: TextEdit.replace(replaceRange, entry.name),
            data,
          };
        }),
      };
    },
    doFormat(
      document: TextDocument,
      formattingOption: FormattingOptions
    ): TextEdit[] {
      const regions: EmbeddedRegion[] = documentRegions
        .get(document)
        .getRegions(this.getId());

      const textEdits: TextEdit[] = [];
      regions.forEach((region) => {
        const range = Range.create(
          region.startLine,
          region.startColumn,
          region.endLine,
          region.endColumn
        );
        const text = document.getText(range);
        let newText = format(text, { parser: "typescript" });
        const space = findTabStr(document, region, formattingOption);
        newText = newText
          .split("\n")
          .map((line) => {
            return space + (line.trim() ? line.trimEnd() : line); // 空行无需trimEnd
          })
          .join("\n");

        textEdits.push({
          range,
          newText: newText + "\n",
        });
      });
      return textEdits;
    },
    onDocumentRemoved(_document: TextDocument) {
      /* nothing to do */
    },
    dispose() {
      /* nothing to do */
    },
  };
}

export function toCompletionItemKind(
  kind: ts.ScriptElementKind
): CompletionItemKind {
  switch (kind) {
    case "primitive type":
    case "keyword":
      return CompletionItemKind.Keyword;
    case "var":
    case "local var":
      return CompletionItemKind.Variable;
    case "property":
    case "getter":
    case "setter":
      return CompletionItemKind.Field;
    case "function":
    case "method":
    case "construct":
    case "call":
    case "index":
      return CompletionItemKind.Function;
    case "enum":
      return CompletionItemKind.Enum;
    case "module":
      return CompletionItemKind.Module;
    case "class":
      return CompletionItemKind.Class;
    case "interface":
      return CompletionItemKind.Interface;
    case "warning":
      return CompletionItemKind.File;
    case "script":
      return CompletionItemKind.File;
    case "directory":
      return CompletionItemKind.Folder;
  }

  return CompletionItemKind.Property;
}

function convertKind(kind: string): CompletionItemKind {
  switch (kind) {
    case Kind.primitiveType:
    case Kind.keyword:
      return CompletionItemKind.Keyword;

    case Kind.const:
    case Kind.let:
    case Kind.variable:
    case Kind.localVariable:
    case Kind.alias:
    case Kind.parameter:
      return CompletionItemKind.Variable;

    case Kind.memberVariable:
    case Kind.memberGetAccessor:
    case Kind.memberSetAccessor:
      return CompletionItemKind.Field;

    case Kind.function:
    case Kind.localFunction:
      return CompletionItemKind.Function;

    case Kind.method:
    case Kind.constructSignature:
    case Kind.callSignature:
    case Kind.indexSignature:
      return CompletionItemKind.Method;

    case Kind.enum:
      return CompletionItemKind.Enum;

    case Kind.enumMember:
      return CompletionItemKind.EnumMember;

    case Kind.module:
    case Kind.externalModuleName:
      return CompletionItemKind.Module;

    case Kind.class:
    case Kind.type:
      return CompletionItemKind.Class;

    case Kind.interface:
      return CompletionItemKind.Interface;

    case Kind.warning:
      return CompletionItemKind.Text;

    case Kind.script:
      return CompletionItemKind.File;

    case Kind.directory:
      return CompletionItemKind.Folder;

    case Kind.string:
      return CompletionItemKind.Constant;

    default:
      return CompletionItemKind.Property;
  }
}

const enum Kind {
  alias = "alias",
  callSignature = "call",
  class = "class",
  const = "const",
  constructorImplementation = "constructor",
  constructSignature = "construct",
  directory = "directory",
  enum = "enum",
  enumMember = "enum member",
  externalModuleName = "external module name",
  function = "function",
  indexSignature = "index",
  interface = "interface",
  keyword = "keyword",
  let = "let",
  localFunction = "local function",
  localVariable = "local var",
  method = "method",
  memberGetAccessor = "getter",
  memberSetAccessor = "setter",
  memberVariable = "property",
  module = "module",
  primitiveType = "primitive type",
  script = "script",
  type = "type",
  variable = "var",
  warning = "warning",
  string = "string",
  parameter = "parameter",
  typeParameter = "type parameter",
}

function toSeverity(ser: Linter.Severity): DiagnosticSeverity {
  switch (ser) {
    case 1:
      return 2;
    case 2:
      return 1;
    default:
      return 2;
  }
}

function convertRange(
  document: TextDocument,
  span: { start: number | undefined; length: number | undefined }
): Range {
  if (typeof span.start === "undefined") {
    const pos = document.positionAt(0);
    return Range.create(pos, pos);
  }
  const startPosition = document.positionAt(span.start);
  const endPosition = document.positionAt(span.start + (span.length || 0));
  return Range.create(startPosition, endPosition);
}
