import { EmbeddedRegion, PugDocumentRegions } from "../embeddedSupport";
import { LanguageModelCache } from "../languageModelCache";
import { Linter } from "eslint";

import { getLanguageService as getTsService } from "../services/typescriptLanguageService";

import {
  FormattingOptions,
  LanguageMode,
  Position,
  TextDocument,
  TextEdit,
} from "../languageModes";
import {
  CompletionItem,
  CompletionItemKind,
  CompletionList,
  DiagnosticSeverity,
  Range,
} from "vscode-css-languageservice";
import { format } from "prettier";
import { findTabStr } from "./lessMode";
import * as ts from "typescript";
import { fileURLToPath } from "url";
import { getOptions } from "../services/eslinter";

export function getJavascriptMode(
  documentRegions: LanguageModelCache<PugDocumentRegions>
): LanguageMode {
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
    doComplete(document: TextDocument, position: Position) {
      const offset = document.offsetAt(position);
      const triggerChar = document.getText()[offset - 1];
      const res = getTsService().getCompletionsAtPosition(
        fileURLToPath(document.uri),
        offset,
        {
          triggerCharacter: getTsTriggerCharacter(triggerChar),
          includeCompletionsWithInsertText: true,
          includeAutomaticOptionalChainCompletions: true,
        }
      );
      if (res == null) {
        return CompletionList.create();
      }
      return {
        isIncomplete: false,
        items: res.entries.map((item, index): CompletionItem => {
          return {
            label: item.name,
            kind: toCompletionItemKind(item.kind),
            insertText: item.insertText,
            sortText: item.sortText + index,
            textEdit: TextEdit.replace(
              Range.create(
                Position.create(position.line, position.character - 1),
                Position.create(position.line, position.character)
              ),
              item.insertText || item.name
            ),
            data: {
              languageId: "javascript",
              uri: document.uri,
              offset: document.offsetAt(position),
              source: item.source,
              tsData: item.data,
            },
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
          .map((a) => (a.trim() ? space + a : ""))
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

// Parameter must to be string, Otherwise I don't like it semantically.
function getTsTriggerCharacter(triggerChar: string) {
  const legalChars = ["@", "#", ".", '"', "'", "`", "/", "<", " "];
  if (legalChars.includes(triggerChar)) {
    return triggerChar as ts.CompletionsTriggerCharacter;
  }
  return undefined;
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
